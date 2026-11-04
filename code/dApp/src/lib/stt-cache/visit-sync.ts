import { getPrisma } from "@/lib/prisma";
import { STT_SYNC_CURSOR_KEYS } from "@/lib/stt-cache/domain";
import { runSttBackgroundSync } from "@/lib/stt-cache/indexer";
import { readSyncCursor, writeSyncCursor } from "@/lib/stt-cache/indexer-persistence";
import { withSttSyncAdvisoryLock } from "@/lib/stt-cache/sync-lock";
import type { SttVisitSyncResponse } from "@/lib/stt-cache/types";
import { STT_VISIT_SYNC_COOLDOWN_MS } from "@/lib/stt-cache/visit-sync-policy";

export { STT_VISIT_SYNC_COOLDOWN_MS };
const VISIT_SYNC_TIME_BUDGET_MS = 4 * 60_000;
const VISIT_ATTEMPT_CURSOR_KEY = "visit-attempt";

/** One bounded attempt per network, shared by every visitor and server instance. */
export async function runSttVisitSync(): Promise<SttVisitSyncResponse> {
  const locked = await withSttSyncAdvisoryLock(async (): Promise<SttVisitSyncResponse> => {
    const db = getPrisma();
    const nowMs = Date.now();
    const previous = await readSyncCursor(db, VISIT_ATTEMPT_CURSOR_KEY);
    const retryAfterMs = previous.lastSyncedAt === null
      ? 0
      : Math.max(0, previous.lastSyncedAt.getTime() + STT_VISIT_SYNC_COOLDOWN_MS - nowMs);
    if (retryAfterMs > 0) {
      return { outcome: "skipped", retryAfterMs };
    }

    // Persist before chain work. A provider error or function termination must
    // retain the cooldown, rather than turn each visitor into another attempt.
    await writeSyncCursor(db, VISIT_ATTEMPT_CURSOR_KEY, {
      cursorValue: null,
      lastSyncedAt: new Date(nowMs)
    });
    await runSttBackgroundSync({ db, deadline: nowMs + VISIT_SYNC_TIME_BUDGET_MS });
    const [history, walletReconcile] = await Promise.all([
      readSyncCursor(db, STT_SYNC_CURSOR_KEYS.historyBackfill),
      readSyncCursor(db, STT_SYNC_CURSOR_KEYS.walletReconcile)
    ]);
    const historyComplete = history.state?.completed === true;
    const walletReconcileComplete = walletReconcile.state?.completed === true;
    return {
      outcome: "ran",
      retryAfterMs: Math.max(0, nowMs + STT_VISIT_SYNC_COOLDOWN_MS - Date.now()),
      historyComplete,
      walletReconcileComplete,
      continuationNeeded: !historyComplete || !walletReconcileComplete
    };
  });
  return locked.acquired
    ? locked.result
    : { outcome: "busy", retryAfterMs: STT_VISIT_SYNC_COOLDOWN_MS };
}
