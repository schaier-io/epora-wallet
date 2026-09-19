import type { PrismaClient } from "@/generated/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import { proposalCopy } from "./copy";
import { mapDetail } from "./store-logic";
import { serializeJsonSafe } from "./serialization";
import {
  MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET,
  MAX_PROPOSALS_PER_CREATOR_WALLET_PER_DAY,
  PROPOSAL_CREATION_QUOTA_WINDOW_MS
} from "./limits";
import type { CreateProposalRequest, ProposalDetailDto } from "./types";

// Creates a proposal row. Kept free of "server-only" and taking an explicit
// PrismaClient (like delete-record.ts) so the quota and duplicate guards can be
// tested against a real database. store.ts composes this with the shared
// prisma singleton.

export class ProposalQuotaExceededError extends Error {}

// A duplicate save maps back to the original only while that original is still
// a usable request: OPEN awaits signatures, SUBMITTING is mid-broadcast, and a
// SUBMITTED body is final on chain (the identical transaction can never be
// filed again). A withdrawn (CANCELLED) original swallows nothing: the creator
// withdrew it on purpose and may re-file the same transaction.
const DEDUPLICABLE_PROPOSAL_STATUSES = ["OPEN", "SUBMITTING", "SUBMITTED"] as const;

export async function createProposalRecord(
  db: PrismaClient,
  request: CreateProposalRequest,
  createdByKeyHash: string
): Promise<ProposalDetailDto> {
  return db.$transaction(async (tx) => {
    const quotaKey = `${STT_CACHE_NETWORK}:${request.walletUnit}:${createdByKeyHash}`;
    // pg_advisory_xact_lock returns void, and Prisma cannot deserialize a void
    // column — the raw form of this statement threw on every call, failing every
    // proposal save with a 500. Project it to a boolean so the lock statement
    // yields a readable row. The lock also serializes two saves of the same
    // draft (same creator + wallet), so the duplicate lookup below never races
    // the first save's insert.
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtextextended(${quotaKey}, 0)) IS NULL) AS locked`;

    // Re-entering the create route with a still-stashed draft re-saves bytes the
    // server already stored (the client's saveInFlight guard is per-mount, and
    // the stash clears only after the first save resolves). Map that replay to
    // the original instead of writing a second identical row. It runs before the
    // quotas so an idempotent replay neither consumes nor trips them, and the
    // window is the creation-quota day the original still counts toward.
    const duplicate = await tx.multiSigProposal.findFirst({
      where: {
        network: STT_CACHE_NETWORK,
        walletUnit: request.walletUnit,
        createdByKeyHash,
        txBodyHash: request.txBodyHash,
        status: { in: [...DEDUPLICABLE_PROPOSAL_STATUSES] },
        createdAt: { gte: new Date(Date.now() - PROPOSAL_CREATION_QUOTA_WINDOW_MS) }
      },
      orderBy: { createdAt: "desc" },
      include: { signatures: true }
    });
    if (duplicate) {
      return mapDetail(duplicate, duplicate.signatures);
    }

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
        proposalCopy.activeProposalLimit(MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET)
      );
    }

    const recentCount = await tx.multiSigProposal.count({
      where: {
        network: STT_CACHE_NETWORK,
        walletUnit: request.walletUnit,
        createdByKeyHash,
        createdAt: { gte: new Date(Date.now() - PROPOSAL_CREATION_QUOTA_WINDOW_MS) }
      }
    });
    if (recentCount >= MAX_PROPOSALS_PER_CREATOR_WALLET_PER_DAY) {
      throw new ProposalQuotaExceededError(
        proposalCopy.dailyProposalLimit(MAX_PROPOSALS_PER_CREATOR_WALLET_PER_DAY)
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
