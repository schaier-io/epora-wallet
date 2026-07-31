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

/**
 * Consume one request from a globally shared PostgreSQL bucket. The upsert is a
 * single atomic statement, so concurrent requests and separate serverless
 * instances cannot each obtain an independent allowance.
 */
export async function consumePostgresRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_CONFIGURED_LIMIT ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1 ||
    windowMs > MAX_WINDOW_MS
  ) {
    throw new Error("Rate-limit configuration must use positive safe integers.");
  }

  const nowMs = Date.now();
  const now = new Date(nowMs);
  const resetAt = new Date(nowMs + windowMs);
  const bucketKey = digestKey(key);
  const db = getPrisma();
  // Prisma's PostgreSQL adapter applies `?schema=` to generated model queries,
  // but raw SQL does not inherit that search path. Qualify the table explicitly
  // so preview/test schemas and production behave identically.
  const table = Prisma.raw(
    `${quotePostgresIdentifier(getDatabaseSchema())}."ApiRateLimit"`
  );
  const rows = await db.$queryRaw<RateLimitRow[]>(Prisma.sql`
    INSERT INTO ${table} AS bucket ("key", "requestCount", "expiresAt", "updatedAt")
    VALUES (${bucketKey}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "requestCount" = CASE
        WHEN bucket."expiresAt" <= ${now}
          THEN 1
        ELSE LEAST(bucket."requestCount" + 1, ${limit + 1})
      END,
      "expiresAt" = CASE
        WHEN bucket."expiresAt" <= ${now}
          THEN ${resetAt}
        ELSE bucket."expiresAt"
      END,
      "updatedAt" = ${now}
    RETURNING "requestCount", "expiresAt"
  `);
  const row = rows[0];
  if (!row) {
    throw new Error("PostgreSQL did not return the consumed rate-limit bucket.");
  }

  // Bounded cleanup. The indexed delete keeps stale caller rows from becoming
  // permanent storage while retaining recently expired rows for diagnostics.
  if (Math.random() < 0.01) {
    await db.apiRateLimit.deleteMany({
      where: { expiresAt: { lt: new Date(nowMs - EXPIRED_BUCKET_RETENTION_MS) } }
    });
  }

  return resultFromRateLimitRow(row, limit, nowMs);
}
