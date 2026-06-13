import "server-only";
import type { MultiSigProposal, ProposalSignature } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import { participantWalletUnits, walletParticipantExists } from "./membership";
import { serializeJsonSafe } from "./serialization";
import type {
  CreateProposalRequest,
  ProposalAuthorityPath,
  ProposalBuildContext,
  ProposalDetailDto,
  ProposalListItemDto,
  ProposalSignatureDto,
  ProposalStatus
} from "./types";

// Server-only data access for multi-sig proposals. All DB reads/writes and
// row→DTO mapping live here; route handlers validate input and call these.

type SignatureWithFlag = ProposalSignatureDto & { witnessSetHex: string };

function mapSignature(signature: ProposalSignature, currentBodyHash: string): SignatureWithFlag {
  return {
    signerKeyHash: signature.signerKeyHash,
    witnessSetHex: signature.witnessSetHex,
    current: signature.txBodyHash === currentBodyHash,
    createdAt: signature.createdAt.toISOString()
  };
}

function mapListItem(
  row: MultiSigProposal,
  signatures: ProposalSignature[]
): ProposalListItemDto {
  const current = signatures.filter((signature) => signature.txBodyHash === row.txBodyHash);
  return {
    id: row.id,
    walletUnit: row.walletUnit,
    walletPolicyId: row.walletPolicyId,
    title: row.title,
    description: row.description,
    actionKind: row.actionKind,
    authorityPath: row.authorityPath as ProposalAuthorityPath,
    status: row.status as ProposalStatus,
    txBodyHash: row.txBodyHash,
    submittedTxHash: row.submittedTxHash,
    createdByKeyHash: row.createdByKeyHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    signatureCount: current.length,
    signerKeyHashes: current.map((signature) => signature.signerKeyHash)
  };
}

function mapDetail(
  row: MultiSigProposal,
  signatures: ProposalSignature[]
): ProposalDetailDto {
  return {
    ...mapListItem(row, signatures),
    unsignedTxHex: row.unsignedTxHex,
    // Forwarded as raw JSON text: datum values may contain bigint/Map, which
    // would break NextResponse.json. The client decodes with the safe reviver.
    buildContextJson: row.buildContextJson,
    summaryJson: row.summaryJson,
    signatures: signatures
      .map((signature) => mapSignature(signature, row.txBodyHash))
      // Current witnesses first, then stale, each newest-first.
      .sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt))
  };
}

export async function createProposalRecord(
  request: CreateProposalRequest,
  createdByKeyHash: string
): Promise<ProposalDetailDto> {
  const row = await prisma.multiSigProposal.create({
    data: {
      network: STT_CACHE_NETWORK,
      walletUnit: request.walletUnit,
      walletPolicyId: request.walletPolicyId,
      title: request.title,
      description: request.description ?? null,
      actionKind: request.actionKind,
      authorityPath: request.authorityPath,
      builder: request.builder,
      buildContextJson: serializeJsonSafe(request.buildContext),
      unsignedTxHex: request.unsignedTxHex,
      txBodyHash: request.txBodyHash,
      summaryJson: request.summary ? serializeJsonSafe(request.summary) : null,
      createdByKeyHash
    },
    include: { signatures: true }
  });
  return mapDetail(row, row.signatures);
}

// Lists proposals visible to a participant: those targeting wallets they belong
// to (per the chain indexer) plus any they created — the proposer fallback
// covers indexer lag on a freshly-minted wallet. Optionally narrowed to a
// single walletUnit. Replaces the old unscoped list so a signed-in wallet can
// no longer enumerate every wallet's proposals.
export async function listProposalRecordsForParticipant(
  paymentKeyHash: string,
  walletUnit?: string
): Promise<ProposalListItemDto[]> {
  const memberUnits = await participantWalletUnits(prisma, paymentKeyHash);

  const rows = await prisma.multiSigProposal.findMany({
    where: {
      network: STT_CACHE_NETWORK,
      ...(walletUnit ? { walletUnit } : {}),
      OR: [{ walletUnit: { in: memberUnits } }, { createdByKeyHash: paymentKeyHash }]
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { signatures: true }
  });
  return rows.map((row) => mapListItem(row, row.signatures));
}

export async function getProposalRecord(id: string): Promise<ProposalDetailDto | null> {
  const row = await prisma.multiSigProposal.findUnique({
    where: { id },
    include: { signatures: true }
  });
  return row ? mapDetail(row, row.signatures) : null;
}

// Upserts a participant's witness. `expectedBodyHash` guards against signing a
// body that was rebuilt out from under the signer between fetch and submit.
export async function upsertProposalSignature(args: {
  proposalId: string;
  signerKeyHash: string;
  witnessSetHex: string;
  expectedBodyHash: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const proposal = await prisma.multiSigProposal.findUnique({
    where: { id: args.proposalId },
    select: { txBodyHash: true, status: true }
  });
  if (!proposal) {
    return { ok: false, status: 404, error: "Proposal not found." };
  }
  if (proposal.status !== "OPEN") {
    return { ok: false, status: 409, error: `Proposal is ${proposal.status.toLowerCase()}.` };
  }
  if (proposal.txBodyHash !== args.expectedBodyHash) {
    return {
      ok: false,
      status: 409,
      error: "The proposal was rebuilt. Reload and re-verify before signing."
    };
  }

  await prisma.proposalSignature.upsert({
    where: {
      proposalId_signerKeyHash: {
        proposalId: args.proposalId,
        signerKeyHash: args.signerKeyHash
      }
    },
    create: {
      proposalId: args.proposalId,
      signerKeyHash: args.signerKeyHash,
      witnessSetHex: args.witnessSetHex,
      txBodyHash: args.expectedBodyHash
    },
    update: {
      witnessSetHex: args.witnessSetHex,
      txBodyHash: args.expectedBodyHash
    }
  });
  return { ok: true };
}

// Replaces a proposal's transaction after a rebuild and clears the now-stale
// signatures (they signed the previous body). Returns the refreshed detail.
export async function replaceProposalBuild(args: {
  proposalId: string;
  unsignedTxHex: string;
  txBodyHash: string;
  buildContext: ProposalBuildContext;
}): Promise<ProposalDetailDto | null> {
  const existing = await prisma.multiSigProposal.findUnique({
    where: { id: args.proposalId },
    select: { status: true }
  });
  if (!existing) {
    return null;
  }

  const row = await prisma.multiSigProposal.update({
    where: { id: args.proposalId },
    data: {
      unsignedTxHex: args.unsignedTxHex,
      txBodyHash: args.txBodyHash,
      buildContextJson: serializeJsonSafe(args.buildContext),
      status: "OPEN",
      submittedTxHash: null,
      // Drop every witness — none of them signed the new body.
      signatures: { deleteMany: {} }
    },
    include: { signatures: true }
  });
  return mapDetail(row, row.signatures);
}

export async function markProposalSubmitted(args: {
  proposalId: string;
  submittedTxHash: string;
}): Promise<ProposalDetailDto | null> {
  const row = await prisma.multiSigProposal.update({
    where: { id: args.proposalId },
    data: { status: "SUBMITTED", submittedTxHash: args.submittedTxHash },
    include: { signatures: true }
  });
  return mapDetail(row, row.signatures);
}

export async function cancelProposalRecord(proposalId: string): Promise<void> {
  await prisma.multiSigProposal.update({
    where: { id: proposalId },
    data: { status: "CANCELLED" }
  });
}

export async function getProposalOwner(
  proposalId: string
): Promise<{ createdByKeyHash: string; status: ProposalStatus } | null> {
  const row = await prisma.multiSigProposal.findUnique({
    where: { id: proposalId },
    select: { createdByKeyHash: true, status: true }
  });
  return row ? { createdByKeyHash: row.createdByKeyHash, status: row.status as ProposalStatus } : null;
}

// Authorization context for a proposal: which wallet it targets, who created it,
// and its status. Route handlers use this to gate reads/mutations to wallet
// participants (see requireProposalParticipant).
export async function getProposalAccess(proposalId: string): Promise<{
  walletUnit: string;
  createdByKeyHash: string;
  status: ProposalStatus;
} | null> {
  const row = await prisma.multiSigProposal.findUnique({
    where: { id: proposalId },
    select: { walletUnit: true, createdByKeyHash: true, status: true }
  });
  return row
    ? {
        walletUnit: row.walletUnit,
        createdByKeyHash: row.createdByKeyHash,
        status: row.status as ProposalStatus
      }
    : null;
}

// True when `paymentKeyHash` is an indexed participant of the STT wallet
// identified by `walletUnit`. Membership is sourced from the chain indexer
// (SttParticipant), which may lag a freshly-minted wallet — callers therefore
// allow the proposer regardless rather than relying on this alone.
export async function isWalletParticipant(
  walletUnit: string,
  paymentKeyHash: string
): Promise<boolean> {
  return walletParticipantExists(prisma, walletUnit, paymentKeyHash);
}
