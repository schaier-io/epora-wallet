import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import { lookupSttWallets } from "@/lib/stt-cache/lookup";
import { STT_CACHE_NETWORK, STT_SYNC_CURSOR_KEYS } from "@/lib/stt-cache/domain";
import {
  getSttSyncCursor,
  reconcileCurrentWallets,
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

test("lookupSttWallets returns the same wallet for payment key hash and address queries", async () => {
  const fixture = createSttFixture();
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
