import type { PrismaClient } from "@/generated/prisma";
import { deserializeAddress } from "@meshsdk/core";
import { getPrisma } from "@/lib/prisma";
import { stateFormFromDatum } from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { parseJsonSafe } from "@/lib/proposals/serialization";
import type { ConstrData } from "@/lib/types/contracts";
import {
  STT_CACHE_NETWORK,
  STT_LOOKUP_DEFAULT_TX_LIMIT,
  STT_LOOKUP_MAX_TX_LIMIT,
  STT_LOOKUP_WALLET_PAGE_SIZE,
  STT_SYNC_CURSOR_KEYS
} from "@/lib/stt-cache/domain";
import { getSttSyncCursor } from "@/lib/stt-cache/indexer";
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
    const parsed: unknown = parseJsonSafe(value);
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

export async function lookupSttWallets(
  input: SttLookupRequest,
  dependencies?: LookupDependencies
): Promise<SttLookupResponse> {
  const db = dependencies?.db ?? getPrisma();
  const txLimit = Math.min(
    Math.max(input.txLimit ?? STT_LOOKUP_DEFAULT_TX_LIMIT, 1),
    STT_LOOKUP_MAX_TX_LIMIT
  );
  const cursor = normalizeOptionalString(input.cursor);
  const resolvedLookup = resolveLookupInput(input);
  const [recentHeadCursor, walletReconcileCursor, historyCursor] = await Promise.all([
    getSttSyncCursor(STT_SYNC_CURSOR_KEYS.recentHead, { db }),
    getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, { db }),
    getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, { db })
  ]);

  if (!resolvedLookup.normalizedPaymentKeyHash) {
    return {
      normalizedPaymentKeyHash: null,
      sourceAddress: resolvedLookup.sourceAddress,
      nextCursor: null,
      wallets: [],
      sync: {
        recentHeadTriggered: false,
        reconcileTriggered: false,
        recentHeadLastSyncedAt: recentHeadCursor.lastSyncedAt?.toISOString() ?? null,
        walletReconcileLastSyncedAt: walletReconcileCursor.lastSyncedAt?.toISOString() ?? null,
        historyBackfillCursor: historyCursor.cursorValue
      }
    };
  }

  // Pages have to stay stable while wallets change under them: `lastSeenBlockTime`
  // moves on every wallet touch, so ordering by it let a wallet cross a page
  // boundary between two requests and be served twice or skipped. Order by the
  // immutable wallet id and page with a keyset predicate instead, which also
  // makes a deleted cursor wallet mean "skip it" rather than "restart the list"
  // (the old `findIndex` + 1 answered page 1 again, looping conformant clients).
  // The page is cut in the database: this route is public, and loading every
  // match for a key listed in many wallets cost a full scan per request. The
  // query runs on wallets, not participants: Prisma applies `distinct` in memory
  // and then drops `take` from the SQL, so a distinct participant query still
  // read every row.
  const pageWallets = await db.sttWallet.findMany({
    where: {
      network: STT_CACHE_NETWORK,
      participants: { some: { paymentKeyHash: resolvedLookup.normalizedPaymentKeyHash } },
      ...(cursor ? { id: { gt: cursor } } : {})
    },
    orderBy: { id: "asc" },
    take: STT_LOOKUP_WALLET_PAGE_SIZE + 1,
    include: {
      participants: {
        where: { paymentKeyHash: resolvedLookup.normalizedPaymentKeyHash },
        select: { role: true }
      },
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
  const wallets = pageWallets.slice(0, STT_LOOKUP_WALLET_PAGE_SIZE);
  const nextCursor =
    pageWallets.length > STT_LOOKUP_WALLET_PAGE_SIZE ? wallets.at(-1)?.id ?? null : null;

  return {
    normalizedPaymentKeyHash: resolvedLookup.normalizedPaymentKeyHash,
    sourceAddress: resolvedLookup.sourceAddress,
    nextCursor,
    wallets: wallets.map((wallet) => ({
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
      matchedRoles: [...new Set(wallet.participants.map((participant) => participant.role))].sort() as SttLookupWallet["matchedRoles"],
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
    })),
    sync: {
      recentHeadTriggered: false,
      reconcileTriggered: false,
      recentHeadLastSyncedAt: recentHeadCursor.lastSyncedAt?.toISOString() ?? null,
      walletReconcileLastSyncedAt: walletReconcileCursor.lastSyncedAt?.toISOString() ?? null,
      historyBackfillCursor: historyCursor.cursorValue
    }
  };
}
