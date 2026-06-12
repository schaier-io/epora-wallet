import type { Prisma, PrismaClient } from "@/generated/prisma";
import type { TransactionInfo } from "@meshsdk/common";
import {
  buildWalletIdentity,
  classifySttWalletTransition,
  compareLatestSeen,
  deriveWalletStatusFromTransition,
  extractTouchedWalletUnits,
  getSttPolicyId,
  getSttScriptAddress,
  STT_CACHE_NETWORK,
  type SttWalletStatusValue
} from "@/lib/stt-cache/domain";
import type {
  AddressTransactionPageEntry,
  ProjectedParticipant,
  SttChainClient
} from "@/lib/stt-cache/types";

// DB persistence layer for the STT indexer, factored out of `indexer.ts` so
// that module stays focused on the sync-cursor orchestration. Every function
// here takes its Prisma client explicitly (no module-level singleton), keeping
// it independently testable and free of any back-dependency on `indexer.ts`.

export type SyncCursorSnapshot = {
  cursorValue: string | null;
  state: Record<string, unknown> | null;
  lastSyncedAt: Date | null;
};

export type IndexedTransactionInfo = Omit<TransactionInfo, "blockHeight" | "blockTime"> & {
  blockHeight: number | null;
  blockTime: number | null;
};

export function stringifyJson(value: unknown) {
  return JSON.stringify(value);
}

function parseJsonRecord(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function withPageMetadata(
  transaction: Awaited<ReturnType<SttChainClient["fetchTxInfo"]>>,
  pageEntry?: AddressTransactionPageEntry
): IndexedTransactionInfo {
  return {
    ...transaction,
    index: pageEntry?.txIndex ?? transaction.index,
    blockHeight: pageEntry?.blockHeight ?? transaction.blockHeight ?? null,
    blockTime: pageEntry?.blockTime ?? transaction.blockTime ?? null
  };
}

export async function readSyncCursor(
  db: PrismaClient,
  cursorKey: string
): Promise<SyncCursorSnapshot> {
  const cursor = await db.sttSyncCursor.findUnique({
    where: {
      network_cursorKey: {
        network: STT_CACHE_NETWORK,
        cursorKey
      }
    }
  });

  return {
    cursorValue: cursor?.cursorValue ?? null,
    state: parseJsonRecord(cursor?.stateJson),
    lastSyncedAt: cursor?.lastSyncedAt ?? null
  };
}

export async function writeSyncCursor(
  db: PrismaClient,
  cursorKey: string,
  payload: {
    cursorValue: string | null;
    state?: Record<string, unknown> | null;
    lastSyncedAt: Date;
  }
) {
  await db.sttSyncCursor.upsert({
    where: {
      network_cursorKey: {
        network: STT_CACHE_NETWORK,
        cursorKey
      }
    },
    create: {
      network: STT_CACHE_NETWORK,
      cursorKey,
      cursorValue: payload.cursorValue,
      stateJson: payload.state ? stringifyJson(payload.state) : null,
      lastSyncedAt: payload.lastSyncedAt
    },
    update: {
      cursorValue: payload.cursorValue,
      stateJson: payload.state ? stringifyJson(payload.state) : null,
      lastSyncedAt: payload.lastSyncedAt
    }
  });
}

export function selectLatestSeen(
  existing: { blockHeight: number | null; blockTime: number | null },
  incoming: { blockHeight: number | null; blockTime: number | null }
) {
  return compareLatestSeen(existing, incoming) > 0 ? existing : incoming;
}

async function upsertWalletSkeleton(
  db: PrismaClient,
  unit: string,
  options: {
    initialStatus: SttWalletStatusValue;
    blockHeight: number | null;
    blockTime: number | null;
    now: Date;
  }
) {
  const identity = buildWalletIdentity(unit);
  const existing = await db.sttWallet.findUnique({
    where: {
      network_unit: {
        network: STT_CACHE_NETWORK,
        unit
      }
    }
  });

  if (!existing) {
    return db.sttWallet.create({
      data: {
        ...identity,
        status: options.initialStatus,
        currentTxHash: null,
        currentOutputIndex: null,
        currentDatumJson: null,
        lastSeenBlockHeight: options.blockHeight,
        lastSeenBlockTime: options.blockTime,
        lastSyncedAt: options.now
      }
    });
  }

  const latestSeen = selectLatestSeen(
    {
      blockHeight: existing.lastSeenBlockHeight,
      blockTime: existing.lastSeenBlockTime
    },
    {
      blockHeight: options.blockHeight,
      blockTime: options.blockTime
    }
  );

  return db.sttWallet.update({
    where: {
      id: existing.id
    },
    data: {
      policyId: identity.policyId,
      assetNameHex: identity.assetNameHex,
      sttScriptAddress: identity.sttScriptAddress,
      walletScriptAddress: identity.walletScriptAddress,
      lastSeenBlockHeight: latestSeen.blockHeight,
      lastSeenBlockTime: latestSeen.blockTime,
      lastSyncedAt: options.now
    }
  });
}

async function upsertChainTransaction(
  db: PrismaClient,
  transaction: IndexedTransactionInfo
) {
  return db.sttChainTransaction.upsert({
    where: {
      network_txHash: {
        network: STT_CACHE_NETWORK,
        txHash: transaction.hash
      }
    },
    create: {
      network: STT_CACHE_NETWORK,
      txHash: transaction.hash,
      slot: transaction.slot,
      block: transaction.block,
      blockHeight: transaction.blockHeight,
      blockTime: transaction.blockTime,
      fees: transaction.fees,
      size: transaction.size,
      deposit: transaction.deposit,
      invalidBefore: transaction.invalidBefore,
      invalidAfter: transaction.invalidAfter,
      rawJson: stringifyJson(transaction)
    },
    update: {
      slot: transaction.slot,
      block: transaction.block,
      blockHeight: transaction.blockHeight,
      blockTime: transaction.blockTime,
      fees: transaction.fees,
      size: transaction.size,
      deposit: transaction.deposit,
      invalidBefore: transaction.invalidBefore,
      invalidAfter: transaction.invalidAfter,
      rawJson: stringifyJson(transaction)
    }
  });
}

// Wipe and rewrite the participant set for a wallet atomically. Accepts either
// a top-level `PrismaClient` or a `Prisma.TransactionClient` so callers can
// either run this on its own (auto-wrapped in `$transaction`) or compose it
// inside a larger transaction that also touches `sttWallet`.
export async function replaceWalletParticipants(
  db: PrismaClient | Prisma.TransactionClient,
  walletId: string,
  participants: ProjectedParticipant[]
) {
  const apply = async (tx: Prisma.TransactionClient) => {
    await tx.sttParticipant.deleteMany({
      where: {
        walletId
      }
    });

    if (participants.length === 0) {
      return;
    }

    await tx.sttParticipant.createMany({
      data: participants.map((participant) => ({
        walletId,
        role: participant.role,
        participantKey: participant.participantKey,
        onChainId: participant.onChainId,
        paymentKeyHash: participant.paymentKeyHash,
        sourceAddress: participant.sourceAddress,
        stakeKeyHash: participant.stakeKeyHash,
        scriptHash: participant.scriptHash
      }))
    });
  };

  // If we were passed a transaction client (no `$transaction`), reuse it.
  // Otherwise open a new transaction so the delete+create pair is atomic.
  if ("$transaction" in db) {
    await db.$transaction(apply);
  } else {
    await apply(db);
  }
}

export async function persistTransactionInfo(
  db: PrismaClient,
  transaction: IndexedTransactionInfo,
  now: Date
) {
  const chainTransaction = await upsertChainTransaction(db, transaction);
  const touchedWalletUnits = extractTouchedWalletUnits(
    transaction,
    getSttPolicyId(),
    getSttScriptAddress()
  );

  let processedWallets = 0;

  for (const [unit, touchpoint] of touchedWalletUnits.entries()) {
    const transitionKind = classifySttWalletTransition(touchpoint);
    const wallet = await upsertWalletSkeleton(db, unit, {
      initialStatus: deriveWalletStatusFromTransition(transitionKind),
      blockHeight: transaction.blockHeight,
      blockTime: transaction.blockTime,
      now
    });

    await db.sttWalletTransaction.upsert({
      where: {
        walletId_chainTransactionId: {
          walletId: wallet.id,
          chainTransactionId: chainTransaction.id
        }
      },
      create: {
        walletId: wallet.id,
        chainTransactionId: chainTransaction.id,
        transitionKind,
        txIndex: transaction.index,
        blockHeight: transaction.blockHeight,
        blockTime: transaction.blockTime,
        slot: transaction.slot
      },
      update: {
        transitionKind,
        txIndex: transaction.index,
        blockHeight: transaction.blockHeight,
        blockTime: transaction.blockTime,
        slot: transaction.slot
      }
    });

    processedWallets += 1;
  }

  return {
    processedTransactions: 1,
    processedWallets
  };
}

export async function fetchAndPersistTransaction(
  chainClient: SttChainClient,
  db: PrismaClient,
  txHash: string,
  now: Date,
  pageEntry?: AddressTransactionPageEntry
) {
  const transaction = withPageMetadata(await chainClient.fetchTxInfo(txHash), pageEntry);
  return persistTransactionInfo(db, transaction, now);
}
