import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Prisma } from "@/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseSchema, quotePostgresIdentifier } from "@/lib/prisma-adapter";
import { consumePostgresRateLimitPair } from "./rate-limit-pair-store";
import { rateLimitBucketStatement, type RateLimitBucket } from "./rate-limit-store";

const DB_SKIP = process.env.DATABASE_URL ? false : "DATABASE_URL not set";
const digest = (key: string) => createHash("sha256").update(key).digest("hex");

function buckets(t: TestContext, primaryLimit = 3, secondaryLimit = 2) {
  const primary: RateLimitBucket = { key: `test:pair:${randomUUID()}`, limit: primaryLimit, windowMs: 60_000 };
  const secondary = { ...primary, key: `${primary.key}:method`, limit: secondaryLimit };
  t.after(async () => {
    await getPrisma().apiRateLimit.deleteMany({ where: { key: { in: [digest(primary.key), digest(secondary.key)] } } });
  });
  return { primary, secondary };
}

test("paired PostgreSQL debits cap concurrent callers and methods", { skip: DB_SKIP }, async t => {
  const { primary, secondary } = buckets(t, 9, 3);
  const results = await Promise.all(Array.from({ length: 20 }, () => consumePostgresRateLimitPair(primary, secondary)));
  assert.equal(results.filter(result => result.primary.ok).length, 9);
  assert.equal(results.filter(result => result.secondary?.ok).length, 3);
  assert.equal(results.filter(result => !result.primary.ok && result.secondary === undefined).length, 11);
  const rows = await getPrisma().apiRateLimit.findMany({ where: { key: { in: [digest(primary.key), digest(secondary.key)] } } });
  assert.equal(rows.find(row => row.key === digest(primary.key))?.requestCount, 10);
  assert.equal(rows.find(row => row.key === digest(secondary.key))?.requestCount, 4);
});

test("a rejected primary debit never creates or updates its method bucket", { skip: DB_SKIP }, async t => {
  const { primary, secondary } = buckets(t, 1, 8);
  primary.cost = 2;
  assert.deepEqual((await consumePostgresRateLimitPair(primary, secondary)).secondary, undefined);
  assert.equal(await getPrisma().apiRateLimit.findUnique({ where: { key: digest(secondary.key) } }), null);
  primary.cost = 1;
  assert.equal((await consumePostgresRateLimitPair(primary, secondary)).primary.ok, false);
  assert.equal(await getPrisma().apiRateLimit.findUnique({ where: { key: digest(secondary.key) } }), null);
});

test("a rejected method still charges an allowed caller", { skip: DB_SKIP }, async t => {
  const { primary, secondary } = buckets(t, 10, 1);
  const db = getPrisma();
  assert.equal((await consumePostgresRateLimitPair(primary, secondary)).secondary?.ok, true);
  const result = await consumePostgresRateLimitPair(primary, secondary);
  assert.equal(result.primary.ok, true);
  assert.equal(result.secondary?.ok, false);
  assert.ok(result.secondary!.retryAfterSeconds >= 1 && result.secondary!.retryAfterSeconds <= 60);
  assert.equal((await db.apiRateLimit.findUnique({ where: { key: digest(primary.key) } }))?.requestCount, 2);
});

test("expired paired buckets restart with each configured cost", { skip: DB_SKIP }, async t => {
  const { primary, secondary } = buckets(t);
  await consumePostgresRateLimitPair(primary, secondary);
  await getPrisma().apiRateLimit.updateMany({
    where: { key: { in: [digest(primary.key), digest(secondary.key)] } },
    data: { expiresAt: new Date(Date.now() - 1), requestCount: 99 }
  });
  const result = await consumePostgresRateLimitPair({ ...primary, cost: 2 }, secondary);
  assert.equal(result.primary.ok, true);
  assert.equal(result.secondary?.ok, true);
  assert.equal((await getPrisma().apiRateLimit.findUnique({ where: { key: digest(primary.key) } }))?.requestCount, 2);
  assert.equal((await getPrisma().apiRateLimit.findUnique({ where: { key: digest(secondary.key) } }))?.requestCount, 1);
});

test("paired raw SQL uses the configured quoted schema", { skip: DB_SKIP }, async t => {
  const schema = `pair"${randomUUID().replaceAll("-", "")}`;
  const db = getPrisma();
  const identifier = Prisma.raw(quotePostgresIdentifier(schema));
  const sourceSchema = Prisma.raw(quotePostgresIdentifier(getDatabaseSchema()));
  await db.$executeRaw(Prisma.sql`CREATE SCHEMA ${identifier}`);
  t.after(async () => { await db.$executeRaw(Prisma.sql`DROP SCHEMA ${identifier} CASCADE`); });
  await db.$executeRaw(Prisma.sql`CREATE TABLE ${identifier}."ApiRateLimit" (LIKE ${sourceSchema}."ApiRateLimit" INCLUDING ALL)`);
  const prior = process.env.DATABASE_URL!;
  const url = new URL(prior);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  try {
    const key = randomUUID();
    assert.equal((await consumePostgresRateLimitPair(
      { key, limit: 1, windowMs: 60_000 }, { key: `${key}:method`, limit: 1, windowMs: 60_000 }
    )).secondary?.ok, true);
    const rows = await db.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS count FROM ${identifier}."ApiRateLimit"`);
    assert.equal(rows[0].count, 2n);
  } finally { process.env.DATABASE_URL = prior; }
});

test("paired debits reject duplicate keys and invalid configuration before querying", async () => {
  const valid: RateLimitBucket = { key: "primary", limit: 3, windowMs: 60_000 };
  await assert.rejects(consumePostgresRateLimitPair(valid, valid), /distinct keys/);
  for (const field of ["limit", "windowMs", "cost"] as const) {
    for (const value of [0, -1, 1.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      await assert.rejects(consumePostgresRateLimitPair({ ...valid, [field]: value }, { ...valid, key: "secondary" }), /positive safe integers/);
      // A valid first SQL fragment needs a schema even though no query is sent.
      const prior = process.env.DATABASE_URL;
      process.env.DATABASE_URL ??= "postgresql://localhost/test?schema=public";
      try {
        await assert.rejects(consumePostgresRateLimitPair(valid, { ...valid, key: "secondary", [field]: value }), /positive safe integers/);
      } finally {
        if (prior === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = prior;
      }
    }
  }
  assert.throws(() => rateLimitBucketStatement({ ...valid, limit: 0 }, Date.now()), /positive safe integers/);
});
