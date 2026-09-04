import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import { lookupSttWallets } from "@/lib/stt-cache/lookup";
import { STT_CACHE_NETWORK, STT_SYNC_CURSOR_KEYS } from "@/lib/stt-cache/domain";
import {
  getSttSyncCursor,
  reconcileCurrentWallets,
  reconcileWalletUnit,
  runSttBackgroundSync,
  syncRecentHead
} from "@/lib/stt-cache/indexer";
import { writeSyncCursor } from "@/lib/stt-cache/indexer-persistence";
import {
  TEST_CONNECTED_ADDRESS,
  TEST_CONNECTED_PAYMENT_KEY_HASH,
  buildCloseTransaction,
  buildForwardTransaction,
  createMockChainClient,
  createSttFixture,
  createTestDatabaseClient,
  resetTestDatabase
} from "@/lib/stt-cache/test-helpers";

// Needs a real Postgres (the package.json `test` script sets DATABASE_URL and
// pushes the schema first). Under plain `pnpm test:unit` there is no database, so
// skip the suite instead of failing, so one `src/**/*.test.ts` glob serves both.
const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set; run via `pnpm test`";

describe("stt-cache integration", { skip: DB_SKIP }, () => {
let db: PrismaClient;

before(async () => {
  db = await createTestDatabaseClient();
});

beforeEach(async () => {
  await resetTestDatabase(db);
});

after(async () => {
  await db.$disconnect();
});

test("syncRecentHead and reconcileCurrentWallets are idempotent with Prisma upserts", async () => {
  const chainClient = createMockChainClient();

  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });
  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });

  assert.equal(await db.sttChainTransaction.count(), 1);
  assert.equal(await db.sttWallet.count(), 1);
  assert.equal(await db.sttWalletTransaction.count(), 1);
  assert.equal(await db.sttParticipant.count(), 5);
});

test("reconcileWalletUnit indexes exactly the one wallet and leaves the cursors alone", async () => {
  const fixture = createSttFixture();
  const base = createMockChainClient();
  let collectionCalls = 0;
  const chainClient = {
    ...base,
    // The targeted reconcile answers from the unit directly; it must never walk
    // the policy collection.
    async fetchCollectionAssets() {
      collectionCalls += 1;
      return { assets: [], next: null };
    }
  };

  const indexed = await reconcileWalletUnit(fixture.unit, { db, chainClient });

  assert.equal(indexed, true);
  assert.equal(collectionCalls, 0);
  assert.equal(await db.sttWallet.count(), 1);
  assert.equal(await db.sttParticipant.count(), 5);
  const reconcileCursor = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, { db });
  assert.equal(reconcileCursor.lastSyncedAt, null);

  // Idempotent, like the collection walk.
  await reconcileWalletUnit(fixture.unit, { db, chainClient });
  assert.equal(await db.sttWallet.count(), 1);
  assert.equal(await db.sttParticipant.count(), 5);
});

/**
 * `indexed` answers "is there a live wallet to act on", not "did the cache take a write".
 * A valid-policy unit whose mint is not confirmed yet has no script UTxO, so the reconcile
 * writes a CLOSED row and there is still nothing to file a proposal against. Answering
 * true here made `POST /api/proposals` fall through to the participation check and reply
 * 403 to the owner of an unconfirmed wallet, instead of the 409 that says "retry".
 */
test("reconcileWalletUnit answers false for a policy unit with no live wallet UTxO", async () => {
  const fixture = createSttFixture();
  const base = createMockChainClient();
  const chainClient = {
    ...base,
    async fetchAddressUTxOs() {
      return [];
    }
  };

  assert.equal(await reconcileWalletUnit(fixture.unit, { db, chainClient }), false);

  // The cache write still happened; only the answer changed.
  const wallet = await db.sttWallet.findFirstOrThrow({ where: { unit: fixture.unit } });
  assert.equal(wallet.status, "CLOSED");
  assert.equal(wallet.currentTxHash, null);
});

/**
 * The chain reads run before the write, so a background pass and the targeted reconcile a
 * proposal files inline can overlap. The pass that read the older UTxO must not commit
 * last and roll the wallet back: `currentTxHash`, the datum and the participants were
 * rewritten unconditionally while only the seen metadata was guarded.
 */
test("reconcileWalletUnit does not roll a wallet back to an older UTxO", async () => {
  const fixture = createSttFixture();
  const forwardTransaction = buildForwardTransaction();
  const forwardUtxo = forwardTransaction.outputs[0]!;
  const base = createMockChainClient();
  const forwardChainClient = {
    ...base,
    async fetchAddressUTxOs() {
      return [forwardUtxo];
    },
    async fetchTxInfo() {
      return forwardTransaction;
    }
  };

  await reconcileWalletUnit(fixture.unit, { db, chainClient: forwardChainClient });
  const forward = await db.sttWallet.findFirstOrThrow({ where: { unit: fixture.unit } });
  assert.equal(forward.currentTxHash, forwardTransaction.hash);
  assert.equal(forward.lastSeenBlockHeight, forwardTransaction.blockHeight);

  // A second pass that read the chain earlier: the mint UTxO, one block behind.
  assert.equal(await reconcileWalletUnit(fixture.unit, { db, chainClient: base }), true);

  const after = await db.sttWallet.findFirstOrThrow({ where: { unit: fixture.unit } });
  assert.equal(after.currentTxHash, forwardTransaction.hash);
  assert.equal(after.currentOutputIndex, forwardUtxo.input.outputIndex);
  assert.equal(after.lastSeenBlockHeight, forwardTransaction.blockHeight);
  // The wallet was checked just now, so the freshness stamp still moves.
  assert.ok(after.lastSyncedAt !== null);
});

/**
 * The stale-read guard must not fire on a read that simply carries no position. Mesh's
 * `fetchTxInfo` reports neither `blockHeight` nor `blockTime` (only an address page entry
 * does), while `syncRecentHead` records both from the page. Comparing those two would
 * read every real reconcile as older than the stored row and skip the state write.
 */
test("reconcile still writes wallet state when the tx read carries no block position", async () => {
  const fixture = createSttFixture();
  const base = createMockChainClient();
  const chainClient = {
    ...base,
    async fetchTxInfo(hash: string) {
      const info = await base.fetchTxInfo(hash);
      return { ...info, blockHeight: undefined, blockTime: undefined };
    }
  };

  // Records the position from the address page, ahead of the positionless reconcile read.
  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });

  const wallet = await db.sttWallet.findFirstOrThrow({ where: { unit: fixture.unit } });
  assert.equal(wallet.status, "ACTIVE");
  assert.equal(wallet.currentTxHash, fixture.mintTransaction.hash);
  assert.equal(wallet.lastSeenBlockHeight, fixture.mintTransaction.blockHeight);
  assert.equal(await db.sttParticipant.count(), 5);
});

test("reconcileWalletUnit answers false for a unit outside the wallet policy", async () => {
  const chainClient = createMockChainClient();

  assert.equal(await reconcileWalletUnit("zz".repeat(10), { db, chainClient }), false);
  assert.equal(await db.sttWallet.count(), 0);
});

test("lookupSttWallets returns the same wallet for payment key hash and address queries", async () => {  const fixture = createSttFixture();
  const chainClient = createMockChainClient();

  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });

  const byHash = await lookupSttWallets(
    {
      paymentKeyHash: TEST_CONNECTED_PAYMENT_KEY_HASH
    },
    {
      db,
      chainClient
    }
  );
  const byAddress = await lookupSttWallets(
    {
      address: TEST_CONNECTED_ADDRESS
    },
    {
      db,
      chainClient
    }
  );

  assert.deepEqual(
    byHash.wallets.map((wallet) => wallet.unit),
    [fixture.unit]
  );
  assert.deepEqual(
    byAddress.wallets.map((wallet) => wallet.unit),
    [fixture.unit]
  );
  assert.deepEqual(byAddress.wallets.map((wallet) => wallet.unit), byHash.wallets.map((wallet) => wallet.unit));
  assert.deepEqual(
    byHash.wallets[0]?.matchedRoles,
    ["ADMIN_USER", "BENEFICIARY", "STREAMING_PAYMENT_RECIPIENT"]
  );
});

test("reconcile keeps the block height and time the head sync recorded", async () => {
  // Mesh's fetchTxInfo carries neither field; only an address page entry does.
  const fixture = createSttFixture();
  const base = createMockChainClient();
  const chainClient = {
    ...base,
    async fetchTxInfo(hash: string) {
      const info = await base.fetchTxInfo(hash);
      return { ...info, blockHeight: undefined, blockTime: undefined };
    }
  };

  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });

  const stored = await db.sttChainTransaction.findUniqueOrThrow({
    where: {
      network_txHash: { network: STT_CACHE_NETWORK, txHash: fixture.mintTransaction.hash }
    }
  });
  assert.equal(stored.blockHeight, fixture.mintTransaction.blockHeight);
  assert.equal(stored.blockTime, fixture.mintTransaction.blockTime);
});

test("syncRecentHead re-arms the history backfill when the old head is beyond the page budget", async () => {
  const fixture = createSttFixture();
  const forward = buildForwardTransaction();
  const forwardEntry = {
    txHash: forward.hash,
    txIndex: forward.index,
    blockHeight: forward.blockHeight ?? null,
    blockTime: forward.blockTime ?? null
  };
  const base = createMockChainClient();
  let pages = [[fixture.transactionPageEntry]];
  const chainClient = {
    ...base,
    async fetchAddressTransactionsPage(_address: string, page: number) {
      return pages[page - 1] ?? [];
    },
    async fetchTxInfo(hash: string) {
      return hash === forward.hash ? forward : base.fetchTxInfo(hash);
    }
  };

  await syncRecentHead({ db, chainClient, pageBudget: 1 });
  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill, {
    cursorValue: "2",
    state: { completed: true },
    lastSyncedAt: new Date()
  });

  // The chain grew by a page: the old head now sits on page 2, outside the budget.
  pages = [[forwardEntry], [fixture.transactionPageEntry]];
  const result = await syncRecentHead({ db, chainClient, pageBudget: 1 });

  assert.equal(result.cursorValue, forward.hash);
  const backfill = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, { db });
  assert.equal(backfill.cursorValue, "2");
  assert.equal(backfill.state?.completed, false);

  // Once the head is back in view, the backfill is left alone.
  await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill, {
    cursorValue: "2",
    state: { completed: true },
    lastSyncedAt: new Date()
  });
  await syncRecentHead({ db, chainClient, pageBudget: 1 });
  const untouched = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, { db });
  assert.equal(untouched.state?.completed, true);
});

test("a re-armed backfill re-reads the page that was partial when it completed", async () => {
  const fixture = createSttFixture();
  const forward = buildForwardTransaction();
  const close = buildCloseTransaction();
  const entryFor = (tx: typeof forward) => ({
    txHash: tx.hash,
    txIndex: tx.index,
    blockHeight: tx.blockHeight ?? null,
    blockTime: tx.blockTime ?? null
  });
  const [mintEntry, forwardEntry, closeEntry] = [
    fixture.transactionPageEntry,
    entryFor(forward),
    entryFor(close)
  ];
  const base = createMockChainClient();
  let pages: Record<"asc" | "desc", (typeof mintEntry)[][]> = {
    asc: [[mintEntry]],
    desc: [[mintEntry]]
  };
  const chainClient = {
    ...base,
    async fetchAddressTransactionsPage(_address: string, page: number, order: "asc" | "desc") {
      return pages[order][page - 1] ?? [];
    },
    async fetchTxInfo(hash: string) {
      if (hash === forward.hash) return forward;
      if (hash === close.hash) return close;
      return base.fetchTxInfo(hash);
    }
  };

  await runSttBackgroundSync({ db, chainClient, recentHeadPageBudget: 1 });

  // Two transactions land. The older one fills up the page the backfill saw
  // last, and the head budget only reaches the newer one.
  pages = {
    asc: [[mintEntry, forwardEntry], [closeEntry]],
    desc: [[closeEntry], [forwardEntry, mintEntry]]
  };
  await runSttBackgroundSync({ db, chainClient, recentHeadPageBudget: 1 });

  const stored = await db.sttChainTransaction.findMany({
    where: { network: STT_CACHE_NETWORK },
    select: { txHash: true }
  });
  assert.deepEqual(
    stored.map((row) => row.txHash).sort(),
    [fixture.mintTransaction.hash, forward.hash, close.hash].sort()
  );
});

test("a run that hits its deadline leaves every phase resumable and the next run completes it", async () => {
  const fixture = createSttFixture();
  const forward = buildForwardTransaction();
  const close = buildCloseTransaction();
  const entryFor = (tx: typeof forward) => ({
    txHash: tx.hash,
    txIndex: tx.index,
    blockHeight: tx.blockHeight ?? null,
    blockTime: tx.blockTime ?? null
  });
  const [mintEntry, forwardEntry, closeEntry] = [
    fixture.transactionPageEntry,
    entryFor(forward),
    entryFor(close)
  ];
  let pages: Record<"asc" | "desc", (typeof mintEntry)[][]> = {
    asc: [[mintEntry]],
    desc: [[mintEntry]]
  };
  let nowMs = 0;
  const base = createMockChainClient();
  const chainClient = {
    ...base,
    async fetchAddressTransactionsPage(_address: string, page: number, order: "asc" | "desc") {
      return pages[order][page - 1] ?? [];
    },
    async fetchTxInfo(hash: string) {
      // Every transaction fetch costs 100 ms on the fake clock.
      nowMs += 100;
      if (hash === forward.hash) return forward;
      if (hash === close.hash) return close;
      return base.fetchTxInfo(hash);
    }
  };
  const clock = () => nowMs;

  // A full first run: the backfill walks the whole chain and marks itself complete.
  await runSttBackgroundSync({ db, chainClient, clock });
  const settled = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, { db });
  assert.equal(settled.state?.completed, true);

  // Two transactions land, and the next run only has time for one fetch.
  pages = {
    asc: [[mintEntry, forwardEntry, closeEntry]],
    desc: [[closeEntry, forwardEntry, mintEntry]]
  };
  const first = await runSttBackgroundSync({ db, chainClient, clock, deadline: nowMs + 50 });

  // The head persisted the older new transaction, then stopped. Its cursor
  // still moved to the newest, so it re-armed the completed backfill to cover
  // the one it never persisted. Reconcile and backfill had no time left.
  assert.equal(first.recentHead.deadlineReached, true);
  assert.equal(first.recentHead.processedTransactions, 1);
  assert.equal(first.recentHead.cursorValue, close.hash);
  assert.equal(first.walletReconcile.deadlineReached, true);
  assert.equal(first.walletReconcile.pagesScanned, 0);
  assert.equal(first.historyBackfill.deadlineReached, true);
  assert.equal(first.historyBackfill.pagesScanned, 0);
  const rearmed = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, { db });
  assert.equal(rearmed.cursorValue, "1");
  assert.equal(rearmed.state?.completed, false);
  assert.equal(await db.sttChainTransaction.count(), 2);

  const second = await runSttBackgroundSync({ db, chainClient, clock });

  assert.equal(second.recentHead.deadlineReached, false);
  assert.equal(second.recentHead.processedTransactions, 0);
  assert.equal(second.walletReconcile.deadlineReached, false);
  assert.equal(second.historyBackfill.deadlineReached, false);
  const stored = await db.sttChainTransaction.findMany({
    where: { network: STT_CACHE_NETWORK },
    select: { txHash: true }
  });
  assert.deepEqual(
    stored.map((row) => row.txHash).sort(),
    [fixture.mintTransaction.hash, forward.hash, close.hash].sort()
  );
  assert.equal(await db.sttParticipant.count(), 5);
  const completed = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, { db });
  assert.equal(completed.state?.completed, true);
});

test("reconcile resumes from the collection page it stopped on", async () => {
  const fixture = createSttFixture();
  const base = createMockChainClient();
  const requestedPages: unknown[] = [];
  let nowMs = 0;
  const chainClient = {
    ...base,
    async fetchCollectionAssets(_policyId: string, cursor?: number | string) {
      requestedPages.push(cursor ?? 1);
      // Two pages that both list the wallet: the second run must ask for page 2 only.
      return {
        assets: [{ unit: fixture.unit, quantity: "1" }],
        next: cursor === undefined ? 2 : null
      };
    },
    async fetchAddressUTxOs(address: string, asset?: string) {
      // Every UTxO lookup costs 100 ms on the fake clock.
      nowMs += 100;
      return base.fetchAddressUTxOs(address, asset);
    }
  };
  const clock = () => nowMs;

  const first = await reconcileCurrentWallets({ db, chainClient, clock, deadline: 50 });

  assert.equal(first.deadlineReached, true);
  assert.equal(first.processedWallets, 1);
  assert.deepEqual(requestedPages, [1]);
  const paused = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, { db });
  assert.equal(paused.state?.nextPage, 2);
  // A partial pass does not attest a full reconcile.
  assert.equal(paused.lastSyncedAt, null);

  const second = await reconcileCurrentWallets({ db, chainClient, clock });

  assert.equal(second.deadlineReached, false);
  assert.deepEqual(requestedPages, [1, 2]);
  const done = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, { db });
  assert.equal(done.state?.nextPage, undefined);
  assert.notEqual(done.lastSyncedAt, null);
  assert.equal(await db.sttWallet.count(), 1);
});

test("reconcile leaves part of the remaining budget to an incomplete backfill", async () => {
  const fixture = createSttFixture();
  const base = createMockChainClient();
  let nowMs = 0;
  const chainClient = {
    ...base,
    async fetchCollectionAssets(_policyId: string, cursor?: number | string) {
      return {
        assets: [{ unit: fixture.unit, quantity: "1" }],
        next: cursor === undefined ? 2 : null
      };
    },
    async fetchAddressUTxOs(address: string, asset?: string) {
      nowMs += 100;
      return base.fetchAddressUTxOs(address, asset);
    },
    async fetchTxInfo(hash: string) {
      nowMs += 100;
      return base.fetchTxInfo(hash);
    }
  };
  const clock = () => nowMs;

  // Head: one fetch (100 ms). Of the 400 ms left, reconcile may use 200, and
  // its first collection page costs 200 (UTxO lookup + transaction fetch), so
  // it stops there. The backfill then still walks the chain to the end.
  const result = await runSttBackgroundSync({ db, chainClient, clock, deadline: 500 });

  assert.equal(result.recentHead.processedTransactions, 1);
  assert.equal(result.walletReconcile.deadlineReached, true);
  assert.equal(result.walletReconcile.pagesScanned, 1);
  const paused = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, { db });
  assert.equal(paused.state?.nextPage, 2);
  assert.equal(result.historyBackfill.deadlineReached, false);
  assert.equal(result.historyBackfill.processedTransactions, 1);
});

test("a backfill cut off mid-page stays on that page and the next run re-reads it", async () => {
  const fixture = createSttFixture();
  const forward = buildForwardTransaction();
  const close = buildCloseTransaction();
  const entryFor = (tx: typeof forward) => ({
    txHash: tx.hash,
    txIndex: tx.index,
    blockHeight: tx.blockHeight ?? null,
    blockTime: tx.blockTime ?? null
  });
  let nowMs = 0;
  const base = createMockChainClient();
  const chainClient = {
    ...base,
    // The head sees an empty chain, so only the backfill lists transactions.
    async fetchAddressTransactionsPage(_address: string, page: number, order: "asc" | "desc") {
      if (order === "desc" || page !== 1) return [];
      return [fixture.transactionPageEntry, entryFor(forward), entryFor(close)];
    },
    async fetchTxInfo(hash: string) {
      nowMs += 100;
      if (hash === forward.hash) return forward;
      if (hash === close.hash) return close;
      return base.fetchTxInfo(hash);
    }
  };
  const clock = () => nowMs;

  // Reconcile fetches one transaction (100 ms); the backfill has time for two more.
  const first = await runSttBackgroundSync({ db, chainClient, clock, deadline: 300 });

  assert.equal(first.historyBackfill.deadlineReached, true);
  assert.equal(first.historyBackfill.processedTransactions, 2);
  assert.equal(first.historyBackfill.cursorValue, "1");
  assert.equal(await db.sttChainTransaction.count(), 2);

  const second = await runSttBackgroundSync({ db, chainClient, clock });

  assert.equal(second.historyBackfill.deadlineReached, false);
  assert.equal(await db.sttChainTransaction.count(), 3);
  const completed = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.historyBackfill, { db });
  assert.equal(completed.state?.completed, true);
});

test("a reconcile cut off mid-page stays on that page and the next run re-reads it", async () => {
  const fixture = createSttFixture();
  const closedUnit = `${fixture.policyId}${"00".repeat(4)}`;
  const base = createMockChainClient();
  let nowMs = 0;
  const chainClient = {
    ...base,
    async fetchCollectionAssets() {
      return {
        assets: [
          { unit: fixture.unit, quantity: "1" },
          { unit: closedUnit, quantity: "1" }
        ],
        next: null
      };
    },
    async fetchAddressUTxOs(address: string, asset?: string) {
      nowMs += 100;
      return base.fetchAddressUTxOs(address, asset);
    }
  };
  const clock = () => nowMs;

  const first = await reconcileCurrentWallets({ db, chainClient, clock, deadline: 100 });

  assert.equal(first.deadlineReached, true);
  assert.equal(first.processedWallets, 1);
  const paused = await getSttSyncCursor(STT_SYNC_CURSOR_KEYS.walletReconcile, { db });
  assert.equal(paused.state?.nextPage, 1);
  assert.equal(await db.sttWallet.count(), 1);

  const second = await reconcileCurrentWallets({ db, chainClient, clock });

  assert.equal(second.deadlineReached, false);
  assert.equal(second.processedWallets, 2);
  assert.equal(await db.sttWallet.count(), 2);
});

test("lookupSttWallets stays read-only when the cache is empty and stale", async () => {
  const chainClient = createMockChainClient();

  const result = await lookupSttWallets(
    {
      paymentKeyHash: TEST_CONNECTED_PAYMENT_KEY_HASH
    },
    {
      db,
      chainClient
    }
  );

  assert.equal(result.sync.recentHeadTriggered, false);
  assert.equal(result.sync.reconcileTriggered, false);
  assert.deepEqual(result.wallets, []);
  assert.equal(await db.sttWallet.count(), 0);
  assert.equal(await db.sttChainTransaction.count(), 0);
});
});
