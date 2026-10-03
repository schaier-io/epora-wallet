import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseSchema, quotePostgresIdentifier } from "@/lib/prisma-adapter";
import { resultFromRateLimitRow, type RateLimitResult, type RateLimitRow } from "./rate-limit-core";

const EXPIRED_BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_CONFIGURED_LIMIT = 1_000_000;
const MAX_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

function digestKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type RateLimitBucket = { key: string; limit: number; windowMs: number; cost?: number };

// Both single and paired debits use the same validation and bounded upsert.
export function rateLimitBucketStatement(
  { key, limit, windowMs, cost = 1 }: RateLimitBucket,
  nowMs: number,
  condition = Prisma.sql`TRUE`
): Prisma.Sql {
  if (
    !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CONFIGURED_LIMIT ||
    !Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > MAX_WINDOW_MS ||
    !Number.isSafeInteger(cost) || cost < 1 || cost > MAX_CONFIGURED_LIMIT
  ) {
    throw new Error("Rate-limit configuration and cost must use positive safe integers.");
  }
  const now = new Date(nowMs);
  const resetAt = new Date(nowMs + windowMs);
  const bucketKey = digestKey(key);
  const initialConsumed = Math.min(cost, limit + 1);
  // Raw SQL needs an explicit schema even when the Prisma adapter has one.
  const table = Prisma.raw(`${quotePostgresIdentifier(getDatabaseSchema())}."ApiRateLimit"`);
  return Prisma.sql`
    INSERT INTO ${table} AS bucket ("key", "requestCount", "expiresAt", "updatedAt")
    SELECT ${bucketKey}, ${initialConsumed}, ${resetAt}, ${now}
    WHERE ${condition}
    ON CONFLICT ("key") DO UPDATE SET
      "requestCount" = CASE
        WHEN bucket."expiresAt" <= ${now} THEN ${initialConsumed}
        ELSE LEAST(bucket."requestCount" + ${cost}, ${limit + 1})
      END,
      "expiresAt" = CASE
        WHEN bucket."expiresAt" <= ${now} THEN ${resetAt}
        ELSE bucket."expiresAt"
      END,
      "updatedAt" = ${now}
    RETURNING "requestCount", "expiresAt"
  `;
}

export async function pruneRateLimitBuckets(nowMs: number): Promise<void> {
  const db = getPrisma();
  // Bounded cleanup. The indexed delete keeps stale caller rows from becoming
  // permanent storage while retaining recently expired rows for diagnostics.
  if (Math.random() < 0.01) {
    await db.apiRateLimit.deleteMany({
      where: { expiresAt: { lt: new Date(nowMs - EXPIRED_BUCKET_RETENTION_MS) } }
    });
  }
}

/** Consume work with one atomic upsert shared across server instances. */
export async function consumePostgresRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  cost = 1
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const statement = rateLimitBucketStatement({ key, limit, windowMs, cost }, nowMs);
  const rows = await getPrisma().$queryRaw<RateLimitRow[]>(statement);
  const row = rows[0];
  if (!row) throw new Error("PostgreSQL did not return the consumed rate-limit bucket.");
  await pruneRateLimitBuckets(nowMs);
  return resultFromRateLimitRow(row, limit, nowMs);
}
