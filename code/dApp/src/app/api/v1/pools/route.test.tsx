import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "pools:test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/mesh/blockfrost-server", () => ({
  getBlockfrostProvider: () => ({ get: mocks.get })
}));

import { GET } from "./route";

const POOL_ID = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";

function meshHttpError(status: number) {
  return JSON.stringify({ data: { status_code: status }, headers: {}, status });
}

function get() {
  return GET(new Request(`http://localhost/api/v1/pools?id=${POOL_ID}`));
}

beforeEach(() => {
  mocks.get.mockReset();
});

it("answers 404 only when Blockfrost has no such pool", async () => {
  mocks.get.mockRejectedValue(meshHttpError(404));

  const response = await get();

  expect(response.status).toBe(404);
});

it("does not report an upstream failure as a missing pool", async () => {
  // A 429 or 5xx used to fold into "not found", sending the user to fix a pool id
  // that was fine.
  mocks.get.mockRejectedValue(meshHttpError(429));

  const response = await get();

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Pool lookup failed." });
});

it("returns the pool when the lookup succeeds without metadata", async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/metadata")) throw meshHttpError(404);
    return { pool_id: POOL_ID, live_saturation: 0.5 };
  });

  const response = await get();

  expect(response.status).toBe(200);
  const body = (await response.json()) as { pool: { poolId: string; ticker: string | null } };
  expect(body.pool.poolId).toBe(POOL_ID);
  expect(body.pool.ticker).toBeNull();
});
