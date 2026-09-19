import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  INDEXER_READ_FAILED_REASON,
  type HealthResponse,
  indexerHealthFromFreshness,
  indexerHealthUnavailable
} from "@/lib/api/health";
import { readIndexingFreshness } from "@/lib/stt-cache/indexing-freshness";
import { logger, serializeError } from "@/lib/observability/logger";
import {
  HEALTH_DEGRADED_FORWARD_COOLDOWN_MS,
  createDegradedForwardGate,
  type HealthProbeFailure
} from "./degraded-forward-gate";

export const runtime = "nodejs";
// A health probe must never be served from cache.
export const dynamic = "force-dynamic";

const DB_PROBE_TIMEOUT_MS = 2_000;
const CURSOR_PROBE_TIMEOUT_MS = 2_000;

// One gate per server instance. The first failure of a degraded state, any
// change of it, and one re-announcement per cooldown forward to Sentry; the
// identical repeats in between are logged at info level locally, so an uptime
// monitor polling a broken deployment cannot flood Sentry. In-memory and
// per-instance by design; docs/RUNBOOK.md §7.2 records the multi-instance
// caveat.
const forwardGate = createDegradedForwardGate(
  {
    forward: (failure) => logger.error(failure.event, { err: serializeError(failure.error) }),
    suppress: (failure) =>
      logger.info(failure.event, { err: serializeError(failure.error), sentrySuppressed: true })
  },
  HEALTH_DEGRADED_FORWARD_COOLDOWN_MS
);

// Runs one dependency probe with a hard timeout. A probe that fails or hangs
// resolves to `{ value: null, failure }` instead of rejecting; the handler
// hands the failure to `forwardGate`, which chooses error-with-Sentry vs
// info-local per degraded state.
async function probeWithTimeout<T>(
  label: string,
  timeoutMs: number,
  operation: () => Promise<T>
): Promise<{ value: T | null; failure: HealthProbeFailure | null }> {
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(() => reject(new Error(`${label} probe timed out`)), timeoutMs)
  );
  try {
    return { value: await Promise.race([operation(), timeout]), failure: null };
  } catch (error) {
    return { value: null, failure: { event: `health.${label}_probe_failed`, error } };
  }
}

// Liveness + dependency readiness. Returns 200 when the database answers and
// the indexer's sync cursors are fresh, 503 (degraded) otherwise, so an uptime
// monitor can alert on the difference. Never throws: a failed probe is
// reported, not raised. The cursor probe makes three indexed point reads and
// no chain calls, and it never writes a cursor: refreshing a stamp here would
// make the health probe itself the sync it is supposed to observe.
export async function GET() {
  const now = new Date();
  const probeFailures: HealthProbeFailure[] = [];

  const db = await probeWithTimeout("db", DB_PROBE_TIMEOUT_MS, () => getPrisma().$queryRaw`SELECT 1`);
  if (db.failure) probeFailures.push(db.failure);
  const dbUp = db.value !== null;

  // Cursor detail: not probed while the database is down (the read would just
  // fail again), null in the response for the same case.
  let indexer: HealthResponse["indexer"] = null;
  let indexerUp = false;
  if (dbUp) {
    const freshness = await probeWithTimeout("indexer", CURSOR_PROBE_TIMEOUT_MS, () =>
      readIndexingFreshness(getPrisma(), now)
    );
    if (freshness.failure) probeFailures.push(freshness.failure);
    indexerUp = freshness.value !== null && freshness.value.up;
    indexer =
      freshness.value === null
        ? indexerHealthUnavailable(INDEXER_READ_FAILED_REASON)
        : indexerHealthFromFreshness(freshness.value);
  }

  const body: HealthResponse = {
    status: dbUp && indexerUp ? "ok" : "degraded",
    checks: {
      database: dbUp ? "up" : "down",
      indexer: !dbUp ? "unknown" : indexerUp ? "up" : "down"
    },
    indexer,
    ts: now.toISOString()
  };

  // Logging only: the gate never touches the body or the status code that the
  // uptime monitor keys on. A healthy probe closes the current incident.
  forwardGate.observe(body, now.getTime(), probeFailures);

  return NextResponse.json(body, { status: body.status === "ok" ? 200 : 503 });
}
