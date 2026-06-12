import type { PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { decodeDatumFromUtxo } from "@/lib/mesh/datum";
import { createDefaultSttChainClient } from "@/lib/stt-cache/chain";
import {
  buildWalletIdentity,
  compareBlockPosition,
  getSttPolicyId,
  getSttScriptAddress,
  STT_CACHE_NETWORK,
  STT_SYNC_CURSOR_KEYS
} from "@/lib/stt-cache/domain";
import {
  fetchAndPersistTransaction,
  persistTransactionInfo,
  readSyncCursor,
  replaceWalletParticipants,
  selectLatestSeen,
  stringifyJson,
  withPageMetadata,
  writeSyncCursor
} from "@/lib/stt-cache/indexer-persistence";
import { projectParticipantsFromDatum } from "@/lib/stt-cache/participants";
import type {
  AddressTransactionPageEntry,
  SttBackgroundSyncResponse,
  SttChainClient,
  SttSyncOperationResult
} from "@/lib/stt-cache/types";

type IndexerDependencies = {
  db?: PrismaClient;
  chainClient?: SttChainClient;
  now?: Date;
};

function getDb(dependencies?: IndexerDependencies) {
  return dependencies?.db ?? prisma;
}

function getChainClient(dependencies?: IndexerDependencies) {
  return dependencies?.chainClient ?? createDefaultSttChainClient();
}

function getNow(dependencies?: IndexerDependencies) {
  return dependencies?.now ?? new Date();
}

export async function getSttSyncCursor(cursorKey: string, dependencies?: IndexerDependencies) {
  return readSyncCursor(getDb(dependencies), cursorKey);
}

export async function syncRecentHead(
  options?: IndexerDependencies & { pageBudget?: number }
): Promise<SttSyncOperationResult> {
  const db = getDb(options);
  const chainClient = getChainClient(options);
  const now = getNow(options);
  const cursor = await readSyncCursor(db, STT_SYNC_CURSOR_KEYS.recentHead);
  const newEntries: AddressTransactionPageEntry[] = [];
  const pageBudget = options?.pageBudget ?? 5;
  const seenTxHashes = new Set<string>();
  let newestCursorValue = cursor.cursorValue;
  let pagesScanned = 0;
  let foundExistingHead = false;

  for (let page = 1; page <= pageBudget; page += 1) {
    const entries = await chainClient.fetchAddressTransactionsPage(
      getSttScriptAddress(),
      page,
      "desc"
    );
    pagesScanned += 1;

    if (page === 1 && entries[0]) {
      newestCursorValue = entries[0].txHash;
    }

    if (entries.length === 0) {
      break;
    }

    for (const entry of entries) {
      if (cursor.cursorValue && entry.txHash === cursor.cursorValue) {
        foundExistingHead = true;
        break;
      }

      if (!seenTxHashes.has(entry.txHash)) {
        seenTxHashes.add(entry.txHash);
        newEntries.push(entry);
      }
    }

    if (foundExistingHead) {
      break;
    }
  }

  newEntries.sort((left, right) =>
    compareBlockPosition(
      {
        blockHeight: left.blockHeight,
        blockTime: left.blockTime,
        txIndex: left.txIndex
      },
      {
        blockHeight: right.blockHeight,
        blockTime: right.blockTime,
        txIndex: right.txIndex
      }
    )
  );

  let processedTransactions = 0;
  let processedWallets = 0;

  for (const entry of newEntries) {
    const result = await fetchAndPersistTransaction(chainClient, db, entry.txHash, now, entry);
    processedTransactions += result.processedTransactions;
    processedWallets += result.processedWallets;
  }

  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.recentHead, {
    cursorValue: newestCursorValue ?? null,
    state: {
      pagesScanned
    },
    lastSyncedAt: now
  });

  return {
    cursorValue: newestCursorValue ?? null,
    processedTransactions,
    processedWallets,
    pagesScanned,
    lastSyncedAt: now.toISOString()
  };
}

async function backfillHistory(
  options?: IndexerDependencies & { pageBudget?: number }
): Promise<SttSyncOperationResult> {
  const db = getDb(options);
  const chainClient = getChainClient(options);
  const now = getNow(options);
  const cursor = await readSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill);
  const pageBudget = options?.pageBudget ?? 10;
  const completed = cursor.state?.completed === true;

  if (completed) {
    return {
      cursorValue: cursor.cursorValue,
      processedTransactions: 0,
      processedWallets: 0,
      pagesScanned: 0,
      lastSyncedAt: cursor.lastSyncedAt?.toISOString() ?? now.toISOString()
    };
  }

  const startPage = Number.parseInt(cursor.cursorValue ?? "1", 10);
  const safeStartPage = Number.isSafeInteger(startPage) && startPage > 0 ? startPage : 1;
  let nextCursorValue: string | null = String(safeStartPage);
  let processedTransactions = 0;
  let processedWallets = 0;
  let pagesScanned = 0;
  let exhausted = false;

  for (let page = safeStartPage; page < safeStartPage + pageBudget; page += 1) {
    const entries = await chainClient.fetchAddressTransactionsPage(
      getSttScriptAddress(),
      page,
      "asc"
    );
    pagesScanned += 1;

    if (entries.length === 0) {
      exhausted = true;
      nextCursorValue = null;
      break;
    }

    for (const entry of entries) {
      const result = await fetchAndPersistTransaction(chainClient, db, entry.txHash, now, entry);
      processedTransactions += result.processedTransactions;
      processedWallets += result.processedWallets;
    }

    nextCursorValue = String(page + 1);
  }

  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill, {
    cursorValue: nextCursorValue,
    state: {
      completed: exhausted
    },
    lastSyncedAt: now
  });

  return {
    cursorValue: nextCursorValue,
    processedTransactions,
    processedWallets,
    pagesScanned,
    lastSyncedAt: now.toISOString()
  };
}

export async function reconcileCurrentWallets(
  options?: IndexerDependencies
): Promise<SttSyncOperationResult> {
  const db = getDb(options);
  const chainClient = getChainClient(options);
  const now = getNow(options);
  const policyId = getSttPolicyId();
  const seenUnits = new Set<string>();
  let cursor: number | string | null | undefined;
  let pagesScanned = 0;
  let processedTransactions = 0;
  let processedWallets = 0;

  do {
    const page = await chainClient.fetchCollectionAssets(policyId, cursor ?? undefined);
    pagesScanned += 1;

    for (const asset of page.assets) {
      if (!asset.unit.startsWith(policyId) || asset.unit.length <= policyId.length) {
        continue;
      }

      if (seenUnits.has(asset.unit)) {
        continue;
      }

      seenUnits.add(asset.unit);
      const identity = buildWalletIdentity(asset.unit, policyId);
      const scriptUtxos = await chainClient.fetchAddressUTxOs(identity.sttScriptAddress, asset.unit);
      const liveUtxo =
        scriptUtxos.find((utxo) =>
          utxo.output.amount.some((amount) => amount.unit === asset.unit)
        ) ?? null;

      if (liveUtxo) {
        const transaction = withPageMetadata(
          await chainClient.fetchTxInfo(liveUtxo.input.txHash)
        );
        const persisted = await persistTransactionInfo(db, transaction, now);
        const datum = decodeDatumFromUtxo(liveUtxo);
        const participants = projectParticipantsFromDatum(datum);
        const existing = await db.sttWallet.findUnique({
          where: {
            network_unit: {
              network: STT_CACHE_NETWORK,
              unit: identity.unit
            }
          }
        });
        const latestSeen = selectLatestSeen(
          {
            blockHeight: existing?.lastSeenBlockHeight ?? null,
            blockTime: existing?.lastSeenBlockTime ?? null
          },
          {
            blockHeight: transaction.blockHeight,
            blockTime: transaction.blockTime
          }
        );

        // Atomic: wallet upsert and participant rewrite must commit together,
        // otherwise readers can observe a wallet with stale participants (or
        // none, mid-rewrite) and concurrent reconcile runs can interleave a
        // delete from one with a create from another.
        await db.$transaction(async (tx) => {
          const wallet = await tx.sttWallet.upsert({
            where: {
              network_unit: {
                network: STT_CACHE_NETWORK,
                unit: identity.unit
              }
            },
            create: {
              ...identity,
              status: "ACTIVE",
              currentTxHash: liveUtxo.input.txHash,
              currentOutputIndex: liveUtxo.input.outputIndex,
              currentDatumJson: datum ? stringifyJson(datum) : null,
              lastSeenBlockHeight: latestSeen.blockHeight,
              lastSeenBlockTime: latestSeen.blockTime,
              lastSyncedAt: now
            },
            update: {
              policyId: identity.policyId,
              assetNameHex: identity.assetNameHex,
              sttScriptAddress: identity.sttScriptAddress,
              walletScriptAddress: identity.walletScriptAddress,
              status: "ACTIVE",
              currentTxHash: liveUtxo.input.txHash,
              currentOutputIndex: liveUtxo.input.outputIndex,
              currentDatumJson: datum ? stringifyJson(datum) : null,
              lastSeenBlockHeight: latestSeen.blockHeight,
              lastSeenBlockTime: latestSeen.blockTime,
              lastSyncedAt: now
            }
          });

          await replaceWalletParticipants(tx, wallet.id, participants);
        });
        processedTransactions += persisted.processedTransactions;
        processedWallets += 1;
      } else {
        await db.$transaction(async (tx) => {
          const wallet = await tx.sttWallet.upsert({
            where: {
              network_unit: {
                network: STT_CACHE_NETWORK,
                unit: identity.unit
              }
            },
            create: {
              ...identity,
              status: "CLOSED",
              currentTxHash: null,
              currentOutputIndex: null,
              currentDatumJson: null,
              lastSeenBlockHeight: null,
              lastSeenBlockTime: null,
              lastSyncedAt: now
            },
            update: {
              policyId: identity.policyId,
              assetNameHex: identity.assetNameHex,
              sttScriptAddress: identity.sttScriptAddress,
              walletScriptAddress: identity.walletScriptAddress,
              status: "CLOSED",
              currentTxHash: null,
              currentOutputIndex: null,
              currentDatumJson: null,
              lastSyncedAt: now
            }
          });

          await replaceWalletParticipants(tx, wallet.id, []);
        });
        processedWallets += 1;
      }
    }

    cursor = page.next;
  } while (cursor);

  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile, {
    cursorValue: String(seenUnits.size),
    state: {
      walletCount: seenUnits.size
    },
    lastSyncedAt: now
  });

  return {
    cursorValue: String(seenUnits.size),
    processedTransactions,
    processedWallets,
    pagesScanned,
    lastSyncedAt: now.toISOString()
  };
}

export async function runSttBackgroundSync(
  options?: IndexerDependencies & {
    recentHeadPageBudget?: number;
    historyBackfillPageBudget?: number;
  }
): Promise<SttBackgroundSyncResponse> {
  const db = getDb(options);
  const chainClient = getChainClient(options);
  const now = getNow(options);

  const sharedDependencies = {
    db,
    chainClient,
    now
  };

  const recentHead = await syncRecentHead({
    ...sharedDependencies,
    pageBudget: options?.recentHeadPageBudget
  });
  const historyBackfill = await backfillHistory({
    ...sharedDependencies,
    pageBudget: options?.historyBackfillPageBudget
  });
  const walletReconcile = await reconcileCurrentWallets(sharedDependencies);

  return {
    recentHead,
    historyBackfill,
    walletReconcile
  };
}
