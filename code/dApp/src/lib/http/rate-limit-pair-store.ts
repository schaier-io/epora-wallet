import { Prisma } from "@/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import { resultFromRateLimitRow, type RateLimitResult, type RateLimitRow } from "./rate-limit-core";
import { pruneRateLimitBuckets, rateLimitBucketStatement, type RateLimitBucket } from "./rate-limit-store";

export type RateLimitPairResult = { primary: RateLimitResult; secondary?: RateLimitResult };

/** Charge the method bucket only when the caller bucket allows this request. */
export async function consumePostgresRateLimitPair(
  primary: RateLimitBucket,
  secondary: RateLimitBucket
): Promise<RateLimitPairResult> {
  if (primary.key === secondary.key) throw new Error("Paired rate-limit buckets must use distinct keys.");
  const nowMs = Date.now();
  const primaryStatement = rateLimitBucketStatement(primary, nowMs);
  const secondaryStatement = rateLimitBucketStatement(secondary, nowMs,
    Prisma.sql`EXISTS (SELECT 1 FROM primary_debit WHERE "requestCount" <= ${primary.limit})`);
  const rows = await getPrisma().$queryRaw<(RateLimitRow & { bucket: string })[]>(Prisma.sql`
    WITH primary_debit AS (${primaryStatement}), secondary_debit AS (${secondaryStatement})
    SELECT 'primary' AS bucket, "requestCount", "expiresAt" FROM primary_debit
    UNION ALL
    SELECT 'secondary' AS bucket, "requestCount", "expiresAt" FROM secondary_debit
  `);
  const primaryRow = rows.find(row => row.bucket === "primary");
  if (!primaryRow) throw new Error("PostgreSQL did not return the primary rate-limit bucket.");
  const primaryResult = resultFromRateLimitRow(primaryRow, primary.limit, nowMs);
  const secondaryRow = rows.find(row => row.bucket === "secondary");
  if (primaryResult.ok && !secondaryRow) throw new Error("PostgreSQL did not return the secondary rate-limit bucket.");
  await pruneRateLimitBuckets(nowMs);
  return {
    primary: primaryResult,
    ...(secondaryRow ? { secondary: resultFromRateLimitRow(secondaryRow, secondary.limit, nowMs) } : {})
  };
}
