import assert from "node:assert/strict";
import { before, beforeEach, describe, after, test } from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import {
  STT_HEALTH_RECENT_HEAD_STALE_MS,
  STT_HEALTH_WALLET_RECONCILE_STALE_MS,
  assessCursorFreshness,
  assessIndexingFreshness,
  readIndexingFreshness
} from "./indexing-freshness";
import { writeSyncCursor } from "./indexer-persistence";
import { STT_SYNC_CURSOR_KEYS } from "./domain";
import {
  createMockChainClient,
  createTestDatabaseClient,
  resetTestDatabase
} from "./test-helpers";
import { reconcileCurrentWallets } from "./indexer";

const BASE_MS = 1_700_000_000_000;

// Pure decision logic first: no database needed to pin freshness, staleness,
// the never-synced state, the threshold boundaries, and clock-skew clamping.

test("a cursor with no stamp is never fresh", () => {
  const verdict = assessCursorFreshness(null, new Date(BASE_MS), STT_HEALTH_RECENT_HEAD_STALE_MS);

  assert.deepEqual(verdict, {
    lastSyncedAt: null,
    fresh: false,
    ageMs: null,
    cause: "never-synced"
  });
});

test("a recent stamp is fresh and carries its age", () => {
  const stamp = new Date(BASE_MS - 30_000);
  const verdict = assessCursorFreshness(stamp, new Date(BASE_MS), STT_HEALTH_RECENT_HEAD_STALE_MS);

  assert.equal(verdict.fresh, true);
  assert.equal(verdict.ageMs, 30_000);
  assert.equal(verdict.cause, "ok");
});

test("a stamp exactly at the threshold is still fresh; one millisecond past is stale", () => {
  const atBoundary = assessCursorFreshness(
    new Date(BASE_MS - STT_HEALTH_RECENT_HEAD_STALE_MS),
    new Date(BASE_MS),
    STT_HEALTH_RECENT_HEAD_STALE_MS
  );
  const onePast = assessCursorFreshness(
    new Date(BASE_MS - STT_HEALTH_RECENT_HEAD_STALE_MS - 1),
    new Date(BASE_MS),
    STT_HEALTH_RECENT_HEAD_STALE_MS
  );

  assert.equal(atBoundary.fresh, true);
  assert.equal(atBoundary.ageMs, STT_HEALTH_RECENT_HEAD_STALE_MS);
  assert.equal(onePast.fresh, false);
  assert.equal(onePast.cause, "stale");
  assert.equal(onePast.ageMs, STT_HEALTH_RECENT_HEAD_STALE_MS + 1);
});

test("a stamp in the future (clock skew) reads as just-synced, not stale", () => {
  const stamp = new Date(BASE_MS + 120_000);
  const verdict = assessCursorFreshness(stamp, new Date(BASE_MS), STT_HEALTH_RECENT_HEAD_STALE_MS);

  assert.equal(verdict.fresh, true);
  assert.equal(verdict.ageMs, 0);
});

test("a stale recent-head cursor degrades health while a fresh reconcile passes", () => {
  const freshness = assessIndexingFreshness({
    recentHeadLastSyncedAt: new Date(BASE_MS - STT_HEALTH_RECENT_HEAD_STALE_MS - 1),
    walletReconcileLastSyncedAt: new Date(BASE_MS - 1_000),
    historyBackfillCompleted: true,
    now: new Date(BASE_MS)
  });

  assert.equal(freshness.up, false);
  assert.deepEqual(freshness.degradedReasons, [
    `${STT_SYNC_CURSOR_KEYS.recentHead}: stale (ageMs=${STT_HEALTH_RECENT_HEAD_STALE_MS + 1} > staleAfterMs=${STT_HEALTH_RECENT_HEAD_STALE_MS})`
  ]);
});

test("a stale wallet-reconcile cursor degrades health on its own threshold", () => {
  const freshness = assessIndexingFreshness({
    recentHeadLastSyncedAt: new Date(BASE_MS - 1_000),
    walletReconcileLastSyncedAt: new Date(BASE_MS - STT_HEALTH_WALLET_RECONCILE_STALE_MS - 1),
    historyBackfillCompleted: true,
    now: new Date(BASE_MS)
  });

  assert.equal(freshness.up, false);
  assert.deepEqual(freshness.degradedReasons, [
    `${STT_SYNC_CURSOR_KEYS.walletReconcile}: stale (ageMs=${STT_HEALTH_WALLET_RECONCILE_STALE_MS + 1} > staleAfterMs=${STT_HEALTH_WALLET_RECONCILE_STALE_MS})`
  ]);
});

test("cursors that were never stamped degrade health explicitly, not as fresh", () => {
  const freshness = assessIndexingFreshness({
    recentHeadLastSyncedAt: null,
    walletReconcileLastSyncedAt: null,
    historyBackfillCompleted: false,
    now: new Date(BASE_MS)
  });

  assert.equal(freshness.up, false);
  assert.deepEqual(freshness.degradedReasons, [
    `${STT_SYNC_CURSOR_KEYS.recentHead}: no completed sync recorded`,
    `${STT_SYNC_CURSOR_KEYS.walletReconcile}: no completed sync recorded`
  ]);
});

test("both cursors fresh means healthy, whatever the backfill reports", () => {
  for (const historyBackfillCompleted of [false, true]) {
    const freshness = assessIndexingFreshness({
      recentHeadLastSyncedAt: new Date(BASE_MS - 1_000),
      walletReconcileLastSyncedAt: new Date(BASE_MS - 2_000),
      historyBackfillCompleted,
      now: new Date(BASE_MS)
    });

    // The backfill is a one-time walk whose stamp freezes once complete, so an
    // incomplete one means history is still catching up, not that indexing
    // stalled: it is reported, never gated on.
    assert.equal(freshness.up, true);
    assert.deepEqual(freshness.degradedReasons, []);
    assert.equal(freshness.historyBackfillCompleted, historyBackfillCompleted);
  }
});

test("a failed cursor read rejects, so the caller can degrade instead of guessing fresh", async () => {
  const brokenDb = {
    sttSyncCursor: {
      findUnique: () => Promise.reject(new Error("connection lost"))
    }
  } as unknown as PrismaClient;

  await assert.rejects(readIndexingFreshness(brokenDb, new Date(BASE_MS)), /connection lost/);
});

// The read path against the real cursor table. Run via `pnpm test`.
const DB_SKIP = process.env.DATABASE_URL ? false : "DATABASE_URL not set — run via `pnpm test`";

describe("readIndexingFreshness against the cursor table", { skip: DB_SKIP }, () => {
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

  test("an empty table is never-synced and unhealthy", async () => {
    const freshness = await readIndexingFreshness(db, new Date(BASE_MS));

    assert.equal(freshness.up, false);
    assert.equal(freshness.recentHead.cause, "never-synced");
    assert.equal(freshness.walletReconcile.cause, "never-synced");
    assert.equal(freshness.historyBackfillCompleted, false);
  });

  test("freshly stamped recurring cursors are healthy", async () => {
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.recentHead, {
      cursorValue: "head",
      lastSyncedAt: new Date(BASE_MS - 1_000)
    });
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile, {
      cursorValue: "1",
      state: { walletCount: 1 },
      lastSyncedAt: new Date(BASE_MS - 2_000)
    });

    const freshness = await readIndexingFreshness(db, new Date(BASE_MS));

    assert.equal(freshness.up, true);
    assert.deepEqual(freshness.degradedReasons, []);
    assert.equal(freshness.recentHead.ageMs, 1_000);
  });

  test("a long-completed backfill stays healthy on an ancient stamp", async () => {
    // Its stamp freezes once complete, so only the completion flag counts.
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.recentHead, {
      cursorValue: "head",
      lastSyncedAt: new Date(BASE_MS - 1_000)
    });
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile, {
      cursorValue: "1",
      lastSyncedAt: new Date(BASE_MS - 2_000)
    });
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill, {
      cursorValue: "41",
      state: { completed: true },
      lastSyncedAt: new Date(BASE_MS - 30 * 24 * 60 * 60_000)
    });

    const freshness = await readIndexingFreshness(db, new Date(BASE_MS));

    assert.equal(freshness.up, true);
    assert.equal(freshness.historyBackfillCompleted, true);
  });

  test("a stale recent-head stamp degrades with the cursor's own reason", async () => {
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.recentHead, {
      cursorValue: "head",
      lastSyncedAt: new Date(BASE_MS - STT_HEALTH_RECENT_HEAD_STALE_MS - 5_000)
    });
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile, {
      cursorValue: "1",
      lastSyncedAt: new Date(BASE_MS - 2_000)
    });

    const freshness = await readIndexingFreshness(db, new Date(BASE_MS));

    assert.equal(freshness.up, false);
    assert.deepEqual(freshness.degradedReasons, [
      `${STT_SYNC_CURSOR_KEYS.recentHead}: stale (ageMs=${STT_HEALTH_RECENT_HEAD_STALE_MS + 5_000} > staleAfterMs=${STT_HEALTH_RECENT_HEAD_STALE_MS})`
    ]);
  });

  test("cursors of another network are ignored", async () => {
    // Freshness is judged for the configured network only; a row for a
    // different network with the same cursor key must not vouch for it.
    await db.sttSyncCursor.create({
      data: {
        network: "mainnet",
        cursorKey: STT_SYNC_CURSOR_KEYS.recentHead,
        cursorValue: "head",
        lastSyncedAt: new Date(BASE_MS)
      }
    });

    const freshness = await readIndexingFreshness(db, new Date(BASE_MS));

    assert.equal(freshness.recentHead.cause, "never-synced");
    assert.equal(freshness.up, false);
  });

  test("an incomplete reconcile pass cannot reset the last-completed-pass age", async () => {
    const completedPassAt = BASE_MS - STT_HEALTH_WALLET_RECONCILE_STALE_MS - 60_000;
    await writeSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile, {
      cursorValue: "7",
      state: { walletCount: 7 },
      lastSyncedAt: new Date(completedPassAt)
    });

    // A run stopped by its deadline before doing any work writes the cursor
    // back with the previous stamp (indexer.ts reconcileCurrentWallets), so
    // the health view keeps seeing the old completed pass, now stale.
    const stopped = await reconcileCurrentWallets({
      db,
      chainClient: createMockChainClient(),
      deadline: 1
    });
    const freshness = await readIndexingFreshness(db, new Date(BASE_MS));

    assert.equal(stopped.deadlineReached, true);
    assert.equal(freshness.walletReconcile.lastSyncedAt?.getTime(), completedPassAt);
    assert.equal(freshness.walletReconcile.cause, "stale");
    assert.equal(freshness.up, false);
  });
});
