import "server-only";
import { getPrisma } from "@/lib/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import { participantWalletUnits, walletParticipantExists } from "./membership";
import { serializeJsonSafe } from "./serialization";
import {
  evaluateProposalCancelGuard,
  evaluateProposalRebuildGuard,
  evaluateProposalSignatureGuard,
  evaluateProposalSubmissionGuard,
  mapDetail,
  mapListItem
} from "./store-logic";
import { validateVKeyWitnessSet } from "./witness-validation";
import {
  MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET,
  MAX_PROPOSALS_PER_CREATOR_WALLET_PER_DAY
} from "./limits";
import {
  ACTIVE_PROPOSAL_STATUSES,
  paginateProposalRows,
  proposalListSegment,
  TERMINAL_PROPOSAL_STATUSES,
  type ProposalListSegment
} from "./list-pagination";
import type {
  CreateProposalRequest,
  ProposalBuildContext,
  ProposalDetailDto,
  ProposalListItemDto,
  ProposalStatus
} from "./types";

// Server-only data access for multi-sig proposals. All DB reads/writes live
// here; route handlers validate input and call these. The pure row→DTO mappers
// and the signature precondition guard live in store-logic.ts (unit-tested).

export async function createProposalRecord(
  request: CreateProposalRequest,
  createdByKeyHash: string
): Promise<ProposalDetailDto> {
  return getPrisma().$transaction(async (tx) => {
    const quotaKey = `${STT_CACHE_NETWORK}:${request.walletUnit}:${createdByKeyHash}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${quotaKey}, 0))`;

    const activeCount = await tx.multiSigProposal.count({
      where: {
        network: STT_CACHE_NETWORK,
        walletUnit: request.walletUnit,
        createdByKeyHash,
        status: { in: ["OPEN", "SUBMITTING"] }
      }
    });
    if (activeCount >= MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET) {
      throw new ProposalQuotaExceededError(
        `Close an existing proposal first; each participant may keep at most ${MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET} active proposals per wallet.`
      );
    }

    const recentCount = await tx.multiSigProposal.count({
      where: {
        network: STT_CACHE_NETWORK,
        walletUnit: request.walletUnit,
        createdByKeyHash,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
    if (recentCount >= MAX_PROPOSALS_PER_CREATOR_WALLET_PER_DAY) {
      throw new ProposalQuotaExceededError(
        `Daily proposal quota reached for this wallet (${MAX_PROPOSALS_PER_CREATOR_WALLET_PER_DAY}).`
      );
    }

    const row = await tx.multiSigProposal.create({
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
  });
}

export class ProposalQuotaExceededError extends Error {}

// Lists proposals visible to a participant: those targeting wallets they belong
// to (per the chain indexer) plus any they created — the proposer fallback
// covers indexer lag on a freshly-minted wallet. Optionally narrowed to a
// single walletUnit. Replaces the old unscoped list so a signed-in wallet can
// no longer enumerate every wallet's proposals.
export async function listProposalRecordsForParticipant(
  paymentKeyHash: string,
  walletUnit: string | undefined,
  options: { limit: number; cursor?: string }
): Promise<{ proposals: ProposalListItemDto[]; nextCursor: string | null }> {
  const db = getPrisma();
  const memberUnits = await participantWalletUnits(db, paymentKeyHash);
  const visibleWhere = {
    network: STT_CACHE_NETWORK,
    ...(walletUnit ? { walletUnit } : {}),
    OR: [{ walletUnit: { in: memberUnits } }, { createdByKeyHash: paymentKeyHash }]
  };

  let cursorSegment: ProposalListSegment | undefined;
  if (options.cursor) {
    // Resolve the cursor only inside the caller's visible set. Besides choosing
    // the correct page segment, this prevents an arbitrary proposal id from
    // becoming a cross-wallet cursor oracle.
    const cursorRow = await db.multiSigProposal.findFirst({
      where: { ...visibleWhere, id: options.cursor },
      select: { status: true }
    });
    if (!cursorRow) {
      return { proposals: [], nextCursor: null };
    }
    cursorSegment = proposalListSegment(cursorRow.status);
  }

  const page = await paginateProposalRows(
    {
      limit: options.limit,
      cursorId: options.cursor,
      cursorSegment
    },
    ({ segment, cursorId, take }) =>
      db.multiSigProposal.findMany({
        where: {
          ...visibleWhere,
          status: {
            in: [
              ...(segment === "active"
                ? ACTIVE_PROPOSAL_STATUSES
                : TERMINAL_PROPOSAL_STATUSES)
            ]
          }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        take,
        select: {
          id: true,
          walletUnit: true,
          walletPolicyId: true,
          title: true,
          description: true,
          actionKind: true,
          authorityPath: true,
          status: true,
          txBodyHash: true,
          submittedTxHash: true,
          createdByKeyHash: true,
          createdAt: true,
          updatedAt: true,
          signatures: {
            select: { signerKeyHash: true, txBodyHash: true }
          }
        }
      })
  );
  return {
    proposals: page.rows.map((row) => mapListItem(row, row.signatures)),
    nextCursor: page.nextCursor
  };
}

export async function getProposalRecord(id: string): Promise<ProposalDetailDto | null> {
  const row = await getPrisma().multiSigProposal.findUnique({
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
  const proposal = await getPrisma().multiSigProposal.findUnique({
    where: { id: args.proposalId },
    select: { txBodyHash: true, status: true }
  });
  const guard = evaluateProposalSignatureGuard(proposal, args.expectedBodyHash);
  if (!guard.ok) {
    return guard;
  }

  const validated = validateVKeyWitnessSet({
    witnessSetHex: args.witnessSetHex,
    txBodyHash: args.expectedBodyHash,
    signerKeyHash: args.signerKeyHash
  });

  await getPrisma().proposalSignature.upsert({
    where: {
      proposalId_signerKeyHash: {
        proposalId: args.proposalId,
        signerKeyHash: args.signerKeyHash
      }
    },
    create: {
      proposalId: args.proposalId,
      signerKeyHash: args.signerKeyHash,
      witnessSetHex: validated.witnessSetHex,
      txBodyHash: args.expectedBodyHash
    },
    update: {
      witnessSetHex: validated.witnessSetHex,
      txBodyHash: args.expectedBodyHash
    }
  });
  return { ok: true };
}

// Replaces a proposal's transaction after a rebuild and clears the now-stale
// signatures (they signed the previous body). Returns the refreshed detail.
export async function replaceProposalBuild(args: {
  proposalId: string;
  actorKeyHash: string;
  expectedBodyHash: string;
  unsignedTxHex: string;
  txBodyHash: string;
  buildContext: ProposalBuildContext;
}): Promise<ProposalMutationResult> {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.multiSigProposal.findUnique({
      where: { id: args.proposalId },
      select: { createdByKeyHash: true, status: true, txBodyHash: true }
    });
    const guard = evaluateProposalRebuildGuard(
      existing,
      args.actorKeyHash,
      args.expectedBodyHash
    );
    if (!guard.ok) {
      return guard;
    }

    const updated = await tx.multiSigProposal.updateMany({
      where: {
        id: args.proposalId,
        createdByKeyHash: args.actorKeyHash,
        status: "OPEN",
        txBodyHash: args.expectedBodyHash
      },
      data: {
        unsignedTxHex: args.unsignedTxHex,
        txBodyHash: args.txBodyHash,
        buildContextJson: serializeJsonSafe(args.buildContext),
        submittedTxHash: null
      }
    });
    if (updated.count !== 1) {
      return { ok: false, status: 409, error: "Proposal changed while it was rebuilding." };
    }

    await tx.proposalSignature.deleteMany({ where: { proposalId: args.proposalId } });
    const row = await tx.multiSigProposal.findUniqueOrThrow({
      where: { id: args.proposalId },
      include: { signatures: true }
    });
    return { ok: true, proposal: mapDetail(row, row.signatures) };
  });
}

export type ProposalMutationResult =
  | { ok: true; proposal: ProposalDetailDto }
  | { ok: false; status: number; error: string };

export async function claimProposalSubmission(args: {
  proposalId: string;
  expectedBodyHash: string;
}): Promise<ProposalMutationResult> {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.multiSigProposal.findUnique({
      where: { id: args.proposalId },
      select: { status: true, txBodyHash: true }
    });
    const guard = evaluateProposalSubmissionGuard(existing, args.expectedBodyHash);
    if (!guard.ok) {
      return guard;
    }

    const claimed = await tx.multiSigProposal.updateMany({
      where: {
        id: args.proposalId,
        status: "OPEN",
        txBodyHash: args.expectedBodyHash
      },
      data: { status: "SUBMITTING" }
    });
    if (claimed.count !== 1) {
      return { ok: false, status: 409, error: "Proposal is already being changed or submitted." };
    }

    const row = await tx.multiSigProposal.findUniqueOrThrow({
      where: { id: args.proposalId },
      include: { signatures: true }
    });
    return { ok: true, proposal: mapDetail(row, row.signatures) };
  });
}

export async function completeProposalSubmission(args: {
  proposalId: string;
  expectedBodyHash: string;
}): Promise<ProposalMutationResult> {
  const updated = await getPrisma().multiSigProposal.updateMany({
    where: {
      id: args.proposalId,
      status: "SUBMITTING",
      txBodyHash: args.expectedBodyHash
    },
    data: { status: "SUBMITTED", submittedTxHash: args.expectedBodyHash }
  });
  if (updated.count !== 1) {
    return { ok: false, status: 409, error: "Proposal changed while it was submitting." };
  }
  const row = await getPrisma().multiSigProposal.findUniqueOrThrow({
    where: { id: args.proposalId },
    include: { signatures: true }
  });
  return { ok: true, proposal: mapDetail(row, row.signatures) };
}

export async function releaseProposalSubmission(args: {
  proposalId: string;
  expectedBodyHash: string;
}): Promise<void> {
  await getPrisma().multiSigProposal.updateMany({
    where: {
      id: args.proposalId,
      status: "SUBMITTING",
      txBodyHash: args.expectedBodyHash
    },
    data: { status: "OPEN" }
  });
}

export async function cancelProposalRecord(args: {
  proposalId: string;
  actorKeyHash: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const existing = await getPrisma().multiSigProposal.findUnique({
    where: { id: args.proposalId },
    select: { createdByKeyHash: true, status: true }
  });
  const guard = evaluateProposalCancelGuard(existing, args.actorKeyHash);
  if (!guard.ok) {
    return guard;
  }
  const updated = await getPrisma().multiSigProposal.updateMany({
    where: {
      id: args.proposalId,
      createdByKeyHash: args.actorKeyHash,
      status: "OPEN"
    },
    data: { status: "CANCELLED" }
  });
  return updated.count === 1
    ? { ok: true }
    : { ok: false, status: 409, error: "Proposal changed while it was being cancelled." };
}

// Authorization context for a proposal: which wallet it targets, who created it,
// and its status. Route handlers use this to gate reads/mutations to wallet
// participants (see requireProposalParticipant).
export async function getProposalAccess(proposalId: string): Promise<{
  walletUnit: string;
  walletPolicyId: string;
  createdByKeyHash: string;
  status: ProposalStatus;
  txBodyHash: string;
} | null> {
  const row = await getPrisma().multiSigProposal.findUnique({
    where: { id: proposalId },
    select: {
      walletUnit: true,
      walletPolicyId: true,
      createdByKeyHash: true,
      status: true,
      txBodyHash: true
    }
  });
  return row
    ? {
        walletUnit: row.walletUnit,
        walletPolicyId: row.walletPolicyId,
        createdByKeyHash: row.createdByKeyHash,
        status: row.status as ProposalStatus,
        txBodyHash: row.txBodyHash
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
  return walletParticipantExists(getPrisma(), walletUnit, paymentKeyHash);
}
