import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";
// A health probe must never be served from cache.
export const dynamic = "force-dynamic";

const DB_PROBE_TIMEOUT_MS = 2_000;

async function probeDatabase(): Promise<boolean> {
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(() => reject(new Error("database probe timed out")), DB_PROBE_TIMEOUT_MS)
  );
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (error) {
    logger.error("health.db_probe_failed", { err: serializeError(error) });
    return false;
  }
}

// Liveness + dependency readiness. Returns 200 when the app can reach its
// database, 503 (degraded) otherwise, so an uptime monitor can alert on the
// difference. Never throws — a failed probe is reported, not raised.
export async function GET() {
  const dbUp = await probeDatabase();
  const status = dbUp ? "ok" : "degraded";
  return NextResponse.json(
    {
      status,
      checks: { database: dbUp ? "up" : "down" },
      ts: new Date().toISOString()
    },
    { status: dbUp ? 200 : 503 }
  );
}
