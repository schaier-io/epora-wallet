import type { Prisma, PrismaClient } from "@/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import { decodeDatumFromUtxo } from "@/lib/mesh/datum";
import { createDefaultSttChainClient } from "@/lib/stt-cache/chain";
import {
  buildWalletIdentity,
  compareBlockPosition,
  getSttPolicyId,
  getSttScriptAddress,
  parseChainSlot,
  snapshotIsBehindStored,
  STT_CACHE_NETWORK,
  STT_SYNC_CURSOR_KEYS
} from "@/lib/stt-cache/domain";
import {
  fetchAndPersistTransaction,
  persistTransactionInfo,
  readChainTransactionPosition,
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
  // Epoch milliseconds. Once the clock passes it, every phase stops at its next
  // checkpoint and leaves a cursor the following run resumes from. Absent means
  // unbounded, which only a run outside a serverless function can afford.
  deadline?: number;
  clock?: () => number;
};

function pastDeadline(dependencies?: IndexerDependencies) {
  if (dependencies?.deadline === undefined) {
    return false;
  }
  return (dependencies.clock ?? Date.now)() >= dependencies.deadline;
}

function getDb(dependencies?: IndexerDependencies) {
  return dependencies?.db ?? getPrisma();
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
  let reachedChainEnd = false;
  let deadlineReached = false;

  for (let page = 1; page <= pageBudget; page += 1) {
    if (pastDeadline(options)) {
      deadlineReached = true;
      break;
    }
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
      reachedChainEnd = true;
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
    if (pastDeadline(options)) {
      deadlineReached = true;
      break;
    }
    const result = await fetchAndPersistTransaction(chainClient, db, entry.txHash, now, entry);
    processedTransactions += result.processedTransactions;
    processedWallets += result.processedWallets;
  }

  // The budget ran out before the old head came into view, so the transactions
  // between the oldest page scanned and that head were never fetched. Moving the
  // cursor past them would skip them for good; the history backfill walks
  // ascending pages, which stay stable, so re-arming it from its last page
  // picks the gap up in this or a later run. A deadline leaves the same kind of
  // gap when it stopped the run between listing entries and persisting them.
  if (
    (pagesScanned > 0 && cursor.cursorValue && !foundExistingHead && !reachedChainEnd) ||
    (deadlineReached && newEntries.length > processedTransactions)
  ) {
    const backfill = await readSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill);
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill, {
      cursorValue: backfill.cursorValue,
      state: { ...backfill.state, completed: false },
      lastSyncedAt: backfill.lastSyncedAt
    });
  }

  // A run that never reached the chain attests nothing new.
  const lastSyncedAt = pagesScanned === 0 ? cursor.lastSyncedAt : now;
  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.recentHead, {
    cursorValue: newestCursorValue ?? null,
    state: {
      pagesScanned
    },
    lastSyncedAt
  });

  return {
    cursorValue: newestCursorValue ?? null,
    processedTransactions,
    processedWallets,
    pagesScanned,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    deadlineReached
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
      lastSyncedAt: cursor.lastSyncedAt?.toISOString() ?? null,
      deadlineReached: false
    };
  }

  const startPage = Number.parseInt(cursor.cursorValue ?? "1", 10);
  const safeStartPage = Number.isSafeInteger(startPage) && startPage > 0 ? startPage : 1;
  let nextCursorValue: string | null = String(safeStartPage);
  let processedTransactions = 0;
  let processedWallets = 0;
  let pagesScanned = 0;
  let exhausted = false;
  let deadlineReached = false;

  for (let page = safeStartPage; page < safeStartPage + pageBudget; page += 1) {
    if (pastDeadline(options)) {
      deadlineReached = true;
      break;
    }
    const entries = await chainClient.fetchAddressTransactionsPage(
      getSttScriptAddress(),
      page,
      "asc"
    );
    pagesScanned += 1;

    if (entries.length === 0) {
      // The page before this one may have been partial and will fill up as the
      // chain grows, so a later re-arm must read it again rather than start here.
      exhausted = true;
      nextCursorValue = String(Math.max(page - 1, 1));
      break;
    }

    for (const entry of entries) {
      if (pastDeadline(options)) {
        deadlineReached = true;
        break;
      }
      const result = await fetchAndPersistTransaction(chainClient, db, entry.txHash, now, entry);
      processedTransactions += result.processedTransactions;
      processedWallets += result.processedWallets;
    }

    if (deadlineReached) {
      // Only part of this page was persisted; the cursor stays on it so the
      // next run reads it again. Persisting is idempotent, so the repeat is safe.
      break;
    }

    nextCursorValue = String(page + 1);
  }

  // A run that never reached the chain attests nothing new.
  const lastSyncedAt = pagesScanned === 0 ? cursor.lastSyncedAt : now;
  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill, {
    cursorValue: nextCursorValue,
    state: {
      completed: exhausted
    },
    lastSyncedAt
  });

  return {
    cursorValue: nextCursorValue,
    processedTransactions,
    processedWallets,
    pagesScanned,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    deadlineReached
  };
}

// Field names inside the wallet reconcile sync cursor's JSON `state`. Read and
// written here, nowhere else; `lookup.ts` reads only the cursor's timestamp.
const WALLET_RECONCILE_STATE = {
  nextPage: "nextPage",
  lastUnit: "lastProcessedUnit",
  lastIndex: "lastProcessedIndex"
} as const;

export async function reconcileCurrentWallets(
  options?: IndexerDependencies
): Promise<SttSyncOperationResult> {
  const db = getDb(options);
  const chainClient = getChainClient(options);
  const now = getNow(options);
  const policyId = getSttPolicyId();
  const seenUnits = new Set<string>();
  const previous = await readSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile);
  // A run that stopped at its deadline left the collection page it had not
  // finished; pick the walk up there instead of from the first page.
  const resumePage = previous.state?.[WALLET_RECONCILE_STATE.nextPage];
  const resuming =
    typeof resumePage === "number" && Number.isSafeInteger(resumePage) && resumePage > 0;
  let cursor: number | null | undefined = resuming ? resumePage : undefined;
  // Where the previous run stopped inside that page: everything up to and
  // including this unit was reconciled. Trusted only when the re-fetched page
  // still shows the unit at the saved index; a reordered or shrunk page falls
  // back to a full re-read, which the idempotent upserts make safe. A saved
  // state from before this field existed resumes at the page start.
  const resumeUnit =
    resuming && typeof previous.state?.[WALLET_RECONCILE_STATE.lastUnit] === "string"
      ? (previous.state?.[WALLET_RECONCILE_STATE.lastUnit] as string)
      : undefined;
  const savedIndex = previous.state?.[WALLET_RECONCILE_STATE.lastIndex];
  const resumeIndex =
    resuming && typeof savedIndex === "number" && Number.isSafeInteger(savedIndex)
      ? savedIndex
      : -1;
  // Progress within the page `cursor` points at: the last asset unit fully
  // reconciled there, and its index. Reset when the walk advances a page.
  let progressUnit: string | undefined = resumeUnit;
  let progressIndex = resumeIndex;
  let pagesScanned = 0;
  let processedTransactions = 0;
  let processedWallets = 0;
  let deadlineReached = false;

  do {
    if (pastDeadline(options)) {
      deadlineReached = true;
      break;
    }
    const page = await chainClient.fetchCollectionAssets(policyId, cursor ?? undefined);
    pagesScanned += 1;

    // The saved progress describes only the first page fetched, the one the
    // previous run stopped on. Skip its already reconciled head, but only
    // while the page still shapes up exactly as saved.
    let start = 0;
    if (
      pagesScanned === 1 &&
      progressUnit !== undefined &&
      page.assets[progressIndex]?.unit === progressUnit
    ) {
      start = progressIndex + 1;
    }

    for (const [index, asset] of page.assets.entries()) {
      if (index < start) {
        continue;
      }

      if (pastDeadline(options)) {
        deadlineReached = true;
        break;
      }

      if (!asset.unit.startsWith(policyId) || asset.unit.length <= policyId.length) {
        continue;
      }

      if (seenUnits.has(asset.unit)) {
        continue;
      }

      seenUnits.add(asset.unit);
      const reconciled = await reconcileWalletAsset(db, chainClient, now, asset.unit);
      processedTransactions += reconciled.processedTransactions;
      processedWallets += 1;
      progressUnit = asset.unit;
      progressIndex = index;
    }

    if (deadlineReached) {
      // The cursor stays on this page and the progress fields mark how far the
      // walk got inside it, so the next run resumes past the wallets already
      // done instead of repeating them.
      break;
    }

    cursor = page.next;
    // The page is fully reconciled; the next one starts unprocessed.
    progressUnit = undefined;
    progressIndex = -1;
  } while (cursor);

  // `lastSyncedAt` is the time the last full pass over the collection finished.
  // A partial pass keeps the previous one, so lookup freshness does not
  // overstate it. Per-wallet freshness lives in `sttWallet.lastSyncedAt`.
  const lastSyncedAt = deadlineReached ? previous.lastSyncedAt : now;
  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile, {
    // Counts the wallets this run walked, which on a resumed pass is only the
    // pages from `nextPage` onward. Diagnostic only; nothing reads it back.
    cursorValue: String(seenUnits.size),
    state: {
      walletCount: seenUnits.size,
      ...(deadlineReached
        ? {
            [WALLET_RECONCILE_STATE.nextPage]: cursor ?? 1,
            // Kept only while the stop left work unfinished inside the page; a
            // stop between pages, or before the first page was fetched on a
            // fresh start, resumes at that page's start. A stop before any
            // fetch on a resumed run carries the saved progress forward.
            ...(progressUnit !== undefined
              ? {
                  [WALLET_RECONCILE_STATE.lastUnit]: progressUnit,
                  [WALLET_RECONCILE_STATE.lastIndex]: progressIndex
                }
              : {})
          }
        : {})
    },
    lastSyncedAt
  });

  return {
    cursorValue: String(seenUnits.size),
    processedTransactions,
    processedWallets,
    pagesScanned,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    deadlineReached
  };
}

/**
 * Hold the reconcile lock for one wallet for the rest of the transaction.
 *
 * The chain reads happen before the write, so two reconciles of the same wallet can
 * overlap: the background collection walk and the targeted reconcile a proposal files
 * inline. Without this the pass that read the older UTxO could commit last and
 * overwrite `currentTxHash`, the datum and the participants with stale values, while
 * `selectLatestSeen` kept the newer freshness metadata. The lock makes the read of the
 * persisted position (the wallet row and the chain position of its `currentTxHash`
 * transaction) and the snapshot comparison and write that depend on it one step; the
 * slot and index comparison in `snapshotIsBehindStored` is what orders two such passes.
 *
 * `pg_advisory_xact_lock` returns void and Prisma cannot deserialize a void column, so
 * the call is projected to a boolean, as in `lib/proposals/store.ts`.
 */
async function lockWalletReconcile(tx: Prisma.TransactionClient, unit: string) {
  const lockKey = `${STT_CACHE_NETWORK}:reconcile:${unit}`;
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL) AS locked`;
}

/**
 * Reconcile one wallet: fetch the unit's live script UTxO, persist its latest
 * transaction, and atomically upsert the wallet row with its participant rewrite.
 * This is the per-wallet body of `reconcileCurrentWallets`, kept in one place so
 * the collection walk and a targeted single-wallet reconcile can never drift
 * apart in what they write.
 */
async function reconcileWalletAsset(
  db: PrismaClient,
  chainClient: SttChainClient,
  now: Date,
  unit: string
): Promise<{ indexed: boolean; processedTransactions: number }> {
  const identity = buildWalletIdentity(unit, getSttPolicyId());
  const scriptUtxos = await chainClient.fetchAddressUTxOs(identity.sttScriptAddress, unit);
  const liveUtxo =
    scriptUtxos.find((utxo) =>
      utxo.output.amount.some((amount) => amount.unit === unit)
    ) ?? null;

  if (liveUtxo) {
    const transaction = withPageMetadata(
      await chainClient.fetchTxInfo(liveUtxo.input.txHash)
    );
    const persisted = await persistTransactionInfo(db, transaction, now);
    const datum = decodeDatumFromUtxo(liveUtxo);
    const participants = projectParticipantsFromDatum(datum);
    // The snapshot's chain position. Mesh's Blockfrost `fetchTxInfo` reports the
    // ledger `slot` and the within-block transaction `index` but neither
    // `blockHeight` nor `blockTime`, so slot and index are what order snapshots
    // on the configured provider.
    const incomingPosition = {
      blockHeight: transaction.blockHeight,
      blockTime: transaction.blockTime,
      slot: parseChainSlot(transaction.slot),
      txIndex: transaction.index
    };

    // Atomic: wallet upsert and participant rewrite must commit together,
    // otherwise readers can observe a wallet with stale participants (or
    // none, mid-rewrite) and concurrent reconcile runs can interleave a
    // delete from one with a create from another.
    await db.$transaction(async (tx) => {
      await lockWalletReconcile(tx, identity.unit);
      // Read inside the lock. Read before it and a reconcile that overtakes this
      // one between the read and the write is invisible here.
      const existing = await tx.sttWallet.findUnique({
        where: {
          network_unit: {
            network: STT_CACHE_NETWORK,
            unit: identity.unit
          }
        }
      });
      // The stored snapshot's position: the block slot and transaction index of
      // the transaction that created the `currentTxHash` UTxO, recorded by the
      // pass that wrote it. Read inside the lock with the row, so an overtaking
      // pass cannot change it unseen.
      const storedPosition = {
        blockHeight: existing?.lastSeenBlockHeight ?? null,
        blockTime: existing?.lastSeenBlockTime ?? null,
        ...(await readChainTransactionPosition(
          tx,
          existing?.id ?? null,
          existing?.currentTxHash ?? null
        ))
      };
      if (existing && snapshotIsBehindStored(storedPosition, incomingPosition)) {
        // This pass read an older UTxO than what is already stored. Writing it back
        // would replace the newer transaction, datum and participants. Only the
        // freshness stamp is still true: the wallet was checked just now.
        await tx.sttWallet.update({
          where: { id: existing.id },
          data: { lastSyncedAt: now }
        });
        return;
      }
      // The freshness metadata is a max-merge, independent of the snapshot write
      // above: only a position that is provably newer may raise it.
      const latestSeen = selectLatestSeen(storedPosition, incomingPosition);
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
    return { indexed: true, processedTransactions: persisted.processedTransactions };
  }

  await db.$transaction(async (tx) => {
    // Same lock as the live branch: an ACTIVE write and this CLOSED write must not
    // interleave their participant rewrites.
    await lockWalletReconcile(tx, identity.unit);
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
        lastSeenBlockHeight: null,
        lastSeenBlockTime: null,
        lastSyncedAt: now
      }
    });

    await replaceWalletParticipants(tx, wallet.id, []);
  });
  // The CLOSED row is a real cache write, but `indexed` answers a different question:
  // did reconciling produce a live wallet to act on. `POST /api/proposals` asks it to
  // choose between "this wallet is not on chain yet" (409, retry) and "you are not a
  // participant" (403). Answering true here sent the owner of an unconfirmed mint the
  // 403, which asserts something the chain has not said.
  return { indexed: false, processedTransactions: 0 };
}

/**
 * Reconcile one wallet right now, by unit. This is how a freshly minted wallet
 * gets indexed in line - e.g. while filing its first proposal - instead of the
 * requester being told to wait for the next background pass. It writes no sync
 * cursors, so a background pass afterwards stays exactly as resumable as it
 * was; run concurrently with a background pass it is safe because every wallet
 * write is atomic (see `reconcileWalletAsset`). Answers false for a unit that
 * does not belong to this app's policy, for chain reads that fail, and for a unit
 * with no live wallet UTxO on chain - the caller decides what "still not indexed"
 * means.
 */
export async function reconcileWalletUnit(
  walletUnit: string,
  options?: IndexerDependencies
): Promise<boolean> {
  const policyId = getSttPolicyId();
  if (!walletUnit.startsWith(policyId) || walletUnit.length <= policyId.length) {
    return false;
  }
  const reconciled = await reconcileWalletAsset(
    getDb(options),
    getChainClient(options),
    getNow(options),
    walletUnit
  );
  return reconciled.indexed;
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

  const clock = options?.clock ?? Date.now;
  const sharedDependencies = {
    db,
    chainClient,
    now,
    clock,
    deadline: options?.deadline
  };

  const recentHead = await syncRecentHead({
    ...sharedDependencies,
    pageBudget: options?.recentHeadPageBudget
  });
  // The reconcile pass is what keeps cached wallet state and participants
  // correct, so it must not starve behind a long history backfill: while the
  // backfill still has pages to walk, reconcile gets at most half of the time
  // left and the backfill gets whatever remains. Once the backfill is complete
  // it returns at once, so reconcile may use the whole budget.
  const backfillCompleted =
    (await readSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill)).state?.completed === true;
  const nowMs = clock();
  const walletReconcile = await reconcileCurrentWallets({
    ...sharedDependencies,
    deadline:
      options?.deadline === undefined || backfillCompleted
        ? options?.deadline
        : nowMs + (options.deadline - nowMs) / 2
  });
  const historyBackfill = await backfillHistory({
    ...sharedDependencies,
    pageBudget: options?.historyBackfillPageBudget
  });

  return {
    recentHead,
    historyBackfill,
    walletReconcile
  };
}
