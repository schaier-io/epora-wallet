// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({ query: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ $queryRaw: mocks.query, apiRateLimit: { deleteMany: mocks.cleanup } }) }));

import { consumePostgresRateLimitPair } from "./rate-limit-pair-store";

const primary = { key: "caller", limit: 10, windowMs: 60_000 };
const secondary = { key: "caller:method", limit: 2, windowMs: 60_000 };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test?schema=pair%22schema");
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  mocks.query.mockReset();
  mocks.cleanup.mockReset();
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("sends both conditional debits in exactly one PostgreSQL statement", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  mocks.query.mockResolvedValue([
    { bucket: "primary", requestCount: 1, expiresAt },
    { bucket: "secondary", requestCount: 1, expiresAt }
  ]);
  expect(await consumePostgresRateLimitPair(primary, secondary)).toEqual({
    primary: { ok: true, retryAfterSeconds: 0 }, secondary: { ok: true, retryAfterSeconds: 0 }
  });
  expect(mocks.query).toHaveBeenCalledTimes(1);
  const statement = mocks.query.mock.calls[0][0] as Prisma.Sql;
  expect(statement.text.match(/INSERT INTO/g)).toHaveLength(2);
  expect(statement.text).toContain('"pair""schema"."ApiRateLimit"');
  expect(statement.text).toContain('EXISTS (SELECT 1 FROM primary_debit WHERE "requestCount" <=');
  expect(statement.text).not.toContain("caller");
});

it.each([
  { rows: [] },
  { rows: [{ bucket: "primary", requestCount: 1, expiresAt: new Date() }] }
])("fails closed for incomplete PostgreSQL results", async ({ rows }) => {
  mocks.query.mockResolvedValue(rows);
  await expect(consumePostgresRateLimitPair(primary, secondary)).rejects.toThrow("PostgreSQL did not return");
});

it("a rejected primary result needs no method result", async () => {
  mocks.query.mockResolvedValue([{ bucket: "primary", requestCount: 11, expiresAt: new Date(Date.now() + 60_000) }]);
  const result = await consumePostgresRateLimitPair(primary, secondary);
  expect(result.primary.ok).toBe(false);
  expect(result.secondary).toBeUndefined();
});

it("does not contact PostgreSQL for invalid buckets", async () => {
  await expect(consumePostgresRateLimitPair({ ...primary, cost: 0 }, secondary)).rejects.toThrow("positive safe integers");
  await expect(consumePostgresRateLimitPair(primary, { ...secondary, windowMs: 0 })).rejects.toThrow("positive safe integers");
  await expect(consumePostgresRateLimitPair(primary, primary)).rejects.toThrow("distinct keys");
  expect(mocks.query).not.toHaveBeenCalled();
});
