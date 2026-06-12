import type { PrismaClient } from "@/generated/prisma";
import { deserializeAddress } from "@meshsdk/core";
import { prisma } from "@/lib/prisma";
import { stateFormFromDatum } from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import type { ConstrData } from "@/lib/types/contracts";
import {
  STT_LOOKUP_DEFAULT_TX_LIMIT,
  STT_LOOKUP_MAX_TX_LIMIT,
  STT_LOOKUP_WALLET_PAGE_SIZE,
  STT_RECENT_HEAD_STALE_MS,
  STT_SYNC_CURSOR_KEYS,
  STT_WALLET_RECONCILE_STALE_MS
} from "@/lib/stt-cache/domain";
import { getSttSyncCursor, reconcileCurrentWallets, syncRecentHead } from "@/lib/stt-cache/indexer";
import type {
  SttChainClient,
  SttLookupRequest,
  SttLookupResponse,
  SttLookupWallet
} from "@/lib/stt-cache/types";

type LookupDependencies = {
  db?: PrismaClient;
  chainClient?: SttChainClient;
};

export class SttLookupInputError extends Error {}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizePaymentKeyHash(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function parseStoredDatum(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "alternative" in parsed &&
      "fields" in parsed
    ) {
      return parsed as ConstrData;
    }
  } catch {
    return null;
  }

  return null;
}

function buildStateSummary(currentDatumJson: string | null) {
  const datum = parseStoredDatum(currentDatumJson);
  const state = datum ? stateFormFromDatum(datum) : null;

  return {
    walletName: normalizeWalletName(state?.walletName),
    userCount: state?.users.length ?? 0,
    adminCount: state?.users.filter((user) => user.isAdmin).length ?? 0,
    beneficiaryCount: state?.beneficiaries.length ?? 0,
    streamingPaymentCount: state?.streamingPayments.length ?? 0
  };
}

function resolveLookupInput(input: SttLookupRequest) {
  if (input.paymentKeyHash) {
    return {
      sourceAddress: null,
      normalizedPaymentKeyHash: normalizePaymentKeyHash(input.paymentKeyHash)
    };
  }

  if (!input.address) {
    throw new Error("Either paymentKeyHash or address is required.");
  }

  const sourceAddress = normalizeOptionalString(input.address);
  if (!sourceAddress) {
    throw new Error("Address must be a non-empty string.");
  }

  let deserialized: ReturnType<typeof deserializeAddress>;
  try {
    deserialized = deserializeAddress(sourceAddress);
  } catch {
    throw new SttLookupInputError(
      `Invalid Cardano address "${sourceAddress}". Expected a bech32 payment address.`
    );
  }

  return {
    sourceAddress,
    normalizedPaymentKeyHash: normalizePaymentKeyHash(deserialized.pubKeyHash)
  };
}

function shouldRefresh(lastSyncedAt: Date | null, staleMs: number) {
  if (!lastSyncedAt) {
    return true;
  }

  return Date.now() - lastSyncedAt.getTime() >= staleMs;
}

export async function lookupSttWallets(
  input: SttLookupRequest,
  dependencies?: LookupDependencies
): Promise<SttLookupResponse> {
  const db = dependencies?.db ?? prisma;
  const txLimit = Math.min(
    Math.max(input.txLimit ?? STT_LOOKUP_DEFAULT_TX_LIMIT, 1),
    STT_LOOKUP_MAX_TX_LIMIT
  );
  const cursor = normalizeOptionalString(input.cursor);
  const resolvedLookup = resolveLookupInput(input);
  let recentHeadTriggered = false;
  let reconcileTriggered = false;

  const syncDependencies = {
    db,
    chainClient: dependencies?.chainClient
  };

  const recentHeadCursor = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.recentHead, { db });
  if (shouldRefresh(recentHeadCursor.lastSyncedAt, STT_RECENT_HEAD_STALE_MS)) {
    await syncRecentHead(syncDependencies);
    recentHeadTriggered = true;
  }

  const walletReconcileCursor = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, {
    db
  });
  if (shouldRefresh(walletReconcileCursor.lastSyncedAt, STT_WALLET_RECONCILE_STALE_MS)) {
    await reconcileCurrentWallets(syncDependencies);
    reconcileTriggered = true;
  }

  const refreshedRecentHeadCursor = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.recentHead, {
    db
  });
  const refreshedWalletCursor = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, {
    db
  });
  const historyCursor = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, {
    db
  });

  if (!resolvedLookup.normalizedPaymentKeyHash) {
    return {
      normalizedPaymentKeyHash: null,
      sourceAddress: resolvedLookup.sourceAddress,
      nextCursor: null,
      wallets: [],
      sync: {
        recentHeadTriggered,
        reconcileTriggered,
        recentHeadLastSyncedAt: refreshedRecentHeadCursor.lastSyncedAt?.toISOString() ?? null,
        walletReconcileLastSyncedAt: refreshedWalletCursor.lastSyncedAt?.toISOString() ?? null,
        historyBackfillCursor: historyCursor.cursorValue
      }
    };
  }

  const participantMatches = await db.sttParticipant.findMany({
    where: {
      paymentKeyHash: resolvedLookup.normalizedPaymentKeyHash
    },
    include: {
      wallet: true
    }
  });

  const groupedMatches = new Map<
    string,
    {
      wallet: (typeof participantMatches)[number]["wallet"];
      roles: Set<(typeof participantMatches)[number]["role"]>;
    }
  >();

  for (const participant of participantMatches) {
    const current = groupedMatches.get(participant.walletId) ?? {
      wallet: participant.wallet,
      roles: new Set<(typeof participantMatches)[number]["role"]>()
    };
    current.roles.add(participant.role);
    groupedMatches.set(participant.walletId, current);
  }

  const sortedMatches = [...groupedMatches.values()].sort((left, right) => {
    if ((right.wallet.lastSeenBlockTime ?? -1) !== (left.wallet.lastSeenBlockTime ?? -1)) {
      return (right.wallet.lastSeenBlockTime ?? -1) - (left.wallet.lastSeenBlockTime ?? -1);
    }

    if ((right.wallet.lastSeenBlockHeight ?? -1) !== (left.wallet.lastSeenBlockHeight ?? -1)) {
      return (right.wallet.lastSeenBlockHeight ?? -1) - (left.wallet.lastSeenBlockHeight ?? -1);
    }

    return left.wallet.unit.localeCompare(right.wallet.unit, "en");
  });

  const startIndex = cursor
    ? Math.max(
        sortedMatches.findIndex((match) => match.wallet.id === cursor) + 1,
        0
      )
    : 0;
  const page = sortedMatches.slice(startIndex, startIndex + STT_LOOKUP_WALLET_PAGE_SIZE);
  const pageWalletIds = page.map((entry) => entry.wallet.id);
  const nextCursor =
    startIndex + STT_LOOKUP_WALLET_PAGE_SIZE < sortedMatches.length
      ? page.at(-1)?.wallet.id ?? null
      : null;

  const wallets = await db.sttWallet.findMany({
    where: {
      id: {
        in: pageWalletIds
      }
    },
    include: {
      walletTransactions: {
        take: txLimit,
        orderBy: [
          {
            blockHeight: "desc"
          },
          {
            blockTime: "desc"
          },
          {
            txIndex: "desc"
          }
        ],
        include: {
          chainTransaction: true
        }
      }
    }
  });

  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));

  return {
    normalizedPaymentKeyHash: resolvedLookup.normalizedPaymentKeyHash,
    sourceAddress: resolvedLookup.sourceAddress,
    nextCursor,
    wallets: page.flatMap((entry) => {
      const wallet = walletById.get(entry.wallet.id);
      if (!wallet) {
        return [];
      }

      return [
        {
          id: wallet.id,
          network: wallet.network,
          policyId: wallet.policyId,
          assetNameHex: wallet.assetNameHex,
          unit: wallet.unit,
          sttScriptAddress: wallet.sttScriptAddress,
          walletScriptAddress: wallet.walletScriptAddress,
          status: wallet.status as SttLookupWallet["status"],
          currentTxHash: wallet.currentTxHash,
          currentOutputIndex: wallet.currentOutputIndex,
          lastSeenBlockHeight: wallet.lastSeenBlockHeight,
          lastSeenBlockTime: wallet.lastSeenBlockTime,
          matchedRoles: [...entry.roles].sort() as SttLookupWallet["matchedRoles"],
          stateSummary: buildStateSummary(wallet.currentDatumJson),
          recentTransactions: wallet.walletTransactions.map((relation) => ({
            txHash: relation.chainTransaction.txHash,
            transitionKind:
              relation.transitionKind as SttLookupWallet["recentTransactions"][number]["transitionKind"],
            slot: relation.chainTransaction.slot,
            txIndex: relation.txIndex,
            block: relation.chainTransaction.block,
            blockHeight: relation.chainTransaction.blockHeight,
            blockTime: relation.chainTransaction.blockTime,
            fees: relation.chainTransaction.fees,
            size: relation.chainTransaction.size,
            deposit: relation.chainTransaction.deposit,
            invalidBefore: relation.chainTransaction.invalidBefore,
            invalidAfter: relation.chainTransaction.invalidAfter
          }))
        }
      ];
    }),
    sync: {
      recentHeadTriggered,
      reconcileTriggered,
      recentHeadLastSyncedAt: refreshedRecentHeadCursor.lastSyncedAt?.toISOString() ?? null,
      walletReconcileLastSyncedAt: refreshedWalletCursor.lastSyncedAt?.toISOString() ?? null,
      historyBackfillCursor: historyCursor.cursorValue
    }
  };
}
