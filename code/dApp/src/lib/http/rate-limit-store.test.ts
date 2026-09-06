import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { getPrisma } from "@/lib/prisma";
import { consumePostgresRateLimit } from "./rate-limit-store";

const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set; run via `pnpm test`";

test("PostgreSQL rate limit atomically caps concurrent requests", { skip: DB_SKIP }, async (t) => {
  const sharedKey = `test:${randomUUID()}`;
  const bucketKey = createHash("sha256").update(sharedKey).digest("hex");
  t.after(async () => {
    await getPrisma().apiRateLimit.delete({ where: { key: bucketKey } });
  });

  const sharedResults = await Promise.all(
    Array.from({ length: 12 }, () => consumePostgresRateLimit(sharedKey, 3, 60_000))
  );
  assert.equal(sharedResults.filter((result) => result.ok).length, 3);
  assert.equal(sharedResults.filter((result) => !result.ok).length, 9);
});

test("PostgreSQL rate limit charges the supplied work cost", { skip: DB_SKIP }, async (t) => {
  const sharedKey = `test:${randomUUID()}`;
  const bucketKey = createHash("sha256").update(sharedKey).digest("hex");
  t.after(async () => {
    await getPrisma().apiRateLimit.delete({ where: { key: bucketKey } });
  });

  assert.equal((await consumePostgresRateLimit(sharedKey, 5, 60_000, 4)).ok, true);
  assert.equal((await consumePostgresRateLimit(sharedKey, 5, 60_000, 2)).ok, false);
});

test("PostgreSQL rate limit rejects work above a fresh bucket's capacity", { skip: DB_SKIP }, async (t) => {
  const sharedKey = `test:${randomUUID()}`;
  const bucketKey = createHash("sha256").update(sharedKey).digest("hex");
  t.after(async () => {
    await getPrisma().apiRateLimit.delete({ where: { key: bucketKey } });
  });

  assert.equal((await consumePostgresRateLimit(sharedKey, 5, 60_000, 50)).ok, false);
  assert.equal((await consumePostgresRateLimit(sharedKey, 5, 60_000, 1)).ok, false);
});
