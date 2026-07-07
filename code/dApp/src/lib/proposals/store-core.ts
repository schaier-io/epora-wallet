import type { PrismaClient } from "@/generated/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import { serializeJsonSafe } from "./serialization";
import { mapDetail, mapListItem } from "./store-mappers";
import type {
  CreateProposalRequest,
  ProposalBuildContext,
  ProposalDetailDto,
  ProposalListItemDto,
  ProposalStatus
} from "./types";

// Data access for multi-sig proposals with an injected PrismaClient. This file
// is deliberately free of "server-only" so node:test can import it and run it
// against a test-scoped database (same DI pattern as stt-cache indexer/lookup).
// Route handlers go through the server-only `store.ts`, which binds the app
// singleton.

export async function createProposalRecordWith(
  db: PrismaClient,
  request: CreateProposalRequest,
  createdByKeyHash: string
): Promise<ProposalDetailDto> {
  const row = await db.multiSigProposal.create({
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

export async function listProposalRecordsWith(
  db: PrismaClient,
  walletUnit?: string
): Promise<ProposalListItemDto[]> {
  const rows = await db.multiSigProposal.findMany({
    where: {
      network: STT_CACHE_NETWORK,
      ...(walletUnit ? { walletUnit } : {})
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { signatures: true }
  });
  return rows.map((row) => mapListItem(row, row.signatures));
}

export async function getProposalRecordWith(
  db: PrismaClient,
  id: string
): Promise<ProposalDetailDto | null> {
  const row = await db.multiSigProposal.findUnique({
    where: { id },
    include: { signatures: true }
  });
  return row ? mapDetail(row, row.signatures) : null;
}

// Upserts a participant's witness. `expectedBodyHash` guards against signing a
// body that was rebuilt out from under the signer between fetch and submit.
export async function upsertProposalSignatureWith(
  db: PrismaClient,
  args: {
    proposalId: string;
    signerKeyHash: string;
    witnessSetHex: string;
    expectedBodyHash: string;
  }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const proposal = await db.multiSigProposal.findUnique({
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

  await db.proposalSignature.upsert({
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
export async function replaceProposalBuildWith(
  db: PrismaClient,
  args: {
    proposalId: string;
    unsignedTxHex: string;
    txBodyHash: string;
    buildContext: ProposalBuildContext;
  }
): Promise<ProposalDetailDto | null> {
  const existing = await db.multiSigProposal.findUnique({
    where: { id: args.proposalId },
    select: { status: true }
  });
  if (!existing) {
    return null;
  }

  const row = await db.multiSigProposal.update({
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

export async function markProposalSubmittedWith(
  db: PrismaClient,
  args: {
    proposalId: string;
    submittedTxHash: string;
  }
): Promise<ProposalDetailDto | null> {
  const row = await db.multiSigProposal.update({
    where: { id: args.proposalId },
    data: { status: "SUBMITTED", submittedTxHash: args.submittedTxHash },
    include: { signatures: true }
  });
  return mapDetail(row, row.signatures);
}

export async function cancelProposalRecordWith(
  db: PrismaClient,
  proposalId: string
): Promise<void> {
  await db.multiSigProposal.update({
    where: { id: proposalId },
    data: { status: "CANCELLED" }
  });
}

export async function getProposalOwnerWith(
  db: PrismaClient,
  proposalId: string
): Promise<{ createdByKeyHash: string; status: ProposalStatus } | null> {
  const row = await db.multiSigProposal.findUnique({
    where: { id: proposalId },
    select: { createdByKeyHash: true, status: true }
  });
  return row ? { createdByKeyHash: row.createdByKeyHash, status: row.status as ProposalStatus } : null;
}
