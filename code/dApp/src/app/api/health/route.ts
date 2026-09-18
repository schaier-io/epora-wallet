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

export const runtime = "nodejs";
// A health probe must never be served from cache.
export const dynamic = "force-dynamic";

const DB_PROBE_TIMEOUT_MS = 2_000;
const CURSOR_PROBE_TIMEOUT_MS = 2_000;

// Runs one dependency probe with a hard timeout. A probe that fails or hangs
// resolves to null instead of rejecting, so the handler can report it.
async function probeWithTimeout<T>(
  label: string,
  timeoutMs: number,
  operation: () => Promise<T>
): Promise<T | null> {
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(() => reject(new Error(`${label} probe timed out`)), timeoutMs)
  );
  try {
    return await Promise.race([operation(), timeout]);
  } catch (error) {
    logger.error(`health.${label}_probe_failed`, { err: serializeError(error) });
    return null;
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
  const dbUp =
    (await probeWithTimeout("db", DB_PROBE_TIMEOUT_MS, () => getPrisma().$queryRaw`SELECT 1`)) !==
    null;

  // Cursor detail: not probed while the database is down (the read would just
  // fail again), null in the response for the same case.
  let indexer: HealthResponse["indexer"] = null;
  let indexerUp = false;
  if (dbUp) {
    const freshness = await probeWithTimeout("indexer", CURSOR_PROBE_TIMEOUT_MS, () =>
      readIndexingFreshness(getPrisma(), now)
    );
    indexerUp = freshness !== null && freshness.up;
    indexer =
      freshness === null
        ? indexerHealthUnavailable(INDEXER_READ_FAILED_REASON)
        : indexerHealthFromFreshness(freshness);
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
  return NextResponse.json(body, { status: body.status === "ok" ? 200 : 503 });
}
