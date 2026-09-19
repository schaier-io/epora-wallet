import type { PrismaClient } from "@/generated/prisma";
import { STT_SYNC_CURSOR_KEYS } from "@/lib/stt-cache/domain";
import { readSyncCursor } from "@/lib/stt-cache/indexer-persistence";

// Health-check view over the indexer's sync cursors (`SttSyncCursor`). Pure
// decision logic first, the database read last, so the decision is testable
// without a database. This module only reads: it must never write a cursor,
// because a timestamp refreshed by the health probe itself would attest
// nothing.

// The sync cron fires about every 5 minutes
// (tasks/subtasks/m4-deploy-03-sync-cron.md), and one run budgets 4 of its
// 5-minute Vercel window (SYNC_TIME_BUDGET_MS in app/api/stt/sync/route.ts),
// so a healthy deployment's legitimate gap between two cursor stamps is at
// most about 9 minutes. Thresholds are counted in missed scheduled runs on
// top of that.
export const STT_SYNC_SCHEDULE_INTERVAL_MS = 5 * 60_000;

// recent-head is stamped whenever a run reached the chain, so 6 missed runs
// (30 minutes) is over three times the worst legitimate gap. This is the
// alert horizon the hardening task names ("stale past ~30 minutes"):
// tasks/subtasks/m5-harden-01-health-alerts.md.
export const STT_HEALTH_RECENT_HEAD_STALE_MS = 6 * STT_SYNC_SCHEDULE_INTERVAL_MS;

// wallet-reconcile is stamped only when a full pass over the collection
// completes (indexer.ts `reconcileCurrentWallets`): a deadline-stopped partial
// pass keeps the previous stamp. On a collection large enough that one pass
// spans several runs, the age legitimately grows to the whole pass duration,
// so this threshold gets twice the recent-head horizon.
export const STT_HEALTH_WALLET_RECONCILE_STALE_MS = 12 * STT_SYNC_SCHEDULE_INTERVAL_MS;

export type CursorFreshnessCause = "ok" | "never-synced" | "stale";

export type CursorFreshnessVerdict = {
  /** The stamp the verdict was computed from, as stored on the cursor. */
  lastSyncedAt: Date | null;
  fresh: boolean;
  /** Milliseconds since the last stamped sync, clamped at 0; null when no sync was ever stamped. */
  ageMs: number | null;
  cause: CursorFreshnessCause;
};

export type IndexingFreshnessInput = {
  recentHeadLastSyncedAt: Date | null;
  walletReconcileLastSyncedAt: Date | null;
  /** `state.completed` of the history-backfill cursor: its walk reached the chain's end. */
  historyBackfillCompleted: boolean;
  now: Date;
};

export type IndexingFreshness = {
  /** True when every cursor that gates health passes. */
  up: boolean;
  recentHead: CursorFreshnessVerdict;
  walletReconcile: CursorFreshnessVerdict;
  historyBackfillCompleted: boolean;
  degradedReasons: string[];
};

/**
 * Judge one cursor's stamp. A missing or never-stamped cursor is never fresh:
 * "no row yet" and "rows exist but no run finished" attest the same thing, so
 * both report as `never-synced` instead of a fresh verdict. Age is clamped at
 * 0, so a stamp slightly in the future (clock skew between the instances that
 * wrote and read it) reads as just-synced, not as stale. Stale means strictly
 * past the threshold: exactly at the boundary is still fresh.
 */
export function assessCursorFreshness(
  lastSyncedAt: Date | null,
  now: Date,
  staleAfterMs: number
): CursorFreshnessVerdict {
  if (!lastSyncedAt) {
    return { lastSyncedAt: null, fresh: false, ageMs: null, cause: "never-synced" };
  }

  const ageMs = Math.max(0, now.getTime() - lastSyncedAt.getTime());
  if (ageMs > staleAfterMs) {
    return { lastSyncedAt, fresh: false, ageMs, cause: "stale" };
  }

  return { lastSyncedAt, fresh: true, ageMs, cause: "ok" };
}

function degradation(verdict: CursorFreshnessVerdict, cursorKey: string, staleAfterMs: number) {
  if (verdict.cause === "ok") {
    return null;
  }
  if (verdict.cause === "never-synced") {
    return `${cursorKey}: no completed sync recorded`;
  }
  return `${cursorKey}: stale (ageMs=${verdict.ageMs} > staleAfterMs=${staleAfterMs})`;
}

/**
 * Which cursors require what:
 *
 * - `recent-head` gates health on freshness. Its stamp advances whenever a
 *   sync run reached the chain (indexer.ts `syncRecentHead`), so it attests
 *   "the indexer is alive", not "every wallet is current".
 * - `wallet-reconcile` gates health on freshness of the last *completed* full
 *   pass (indexer.ts `reconcileCurrentWallets`). It attests that cached wallet
 *   state was re-checked against the chain within the threshold.
 * - `history-backfill` gates nothing. It is a one-time walk that freezes once
 *   completed (later runs return early), so its stamp's age means nothing;
 *   only its `completed` flag is reported, and an incomplete backfill means
 *   history is still catching up, not that indexing is stalled.
 */
export function assessIndexingFreshness(input: IndexingFreshnessInput): IndexingFreshness {
  const recentHead = assessCursorFreshness(
    input.recentHeadLastSyncedAt,
    input.now,
    STT_HEALTH_RECENT_HEAD_STALE_MS
  );
  const walletReconcile = assessCursorFreshness(
    input.walletReconcileLastSyncedAt,
    input.now,
    STT_HEALTH_WALLET_RECONCILE_STALE_MS
  );

  const degradedReasons = [
    degradation(recentHead, STT_SYNC_CURSOR_KEYS.recentHead, STT_HEALTH_RECENT_HEAD_STALE_MS),
    degradation(
      walletReconcile,
      STT_SYNC_CURSOR_KEYS.walletReconcile,
      STT_HEALTH_WALLET_RECONCILE_STALE_MS
    )
  ].filter((reason): reason is string => reason !== null);

  return {
    up: degradedReasons.length === 0,
    recentHead,
    walletReconcile,
    historyBackfillCompleted: input.historyBackfillCompleted,
    degradedReasons
  };
}

/**
 * Read the three sync cursors for the configured network and judge them.
 * Three indexed point reads, no chain calls. Throws on database failure; the
 * caller decides how a failed read degrades the health response.
 */
export async function readIndexingFreshness(
  db: PrismaClient,
  now: Date
): Promise<IndexingFreshness> {
  const [recentHead, walletReconcile, historyBackfill] = await Promise.all([
    readSyncCursor(db, STT_SYNC_CURSOR_KEYS.recentHead),
    readSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile),
    readSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill)
  ]);

  return assessIndexingFreshness({
    recentHeadLastSyncedAt: recentHead.lastSyncedAt,
    walletReconcileLastSyncedAt: walletReconcile.lastSyncedAt,
    // Same idiom the sync runner itself uses to decide whether the backfill
    // still has pages to walk (indexer.ts `runSttBackgroundSync`).
    historyBackfillCompleted: historyBackfill.state?.completed === true,
    now
  });
}
