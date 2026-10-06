import { beforeEach, expect, it, vi } from "vitest";
import { POOL_SEARCH_QUERY_MAX_LENGTH, PoolSearchResponseSchema } from "@/lib/api/pools";
import { resetPoolIndexForTests } from "@/lib/pools/pool-index";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "pools:test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/mesh/blockfrost-server", () => ({
  getBlockfrostProvider: () => ({ get: mocks.get })
}));

import { GET } from "./route";

const POOLS = [
  { pool_id: "pool1epora", live_saturation: 0.3, live_stake: "1", margin_cost: 0, fixed_cost: "1", metadata: { ticker: "EPORA", name: "Epora" } },
  { pool_id: "pool1other", live_saturation: 0.3, live_stake: "1", margin_cost: 0, fixed_cost: "1", metadata: { ticker: "OTHER", name: "Other" } }
];

function meshHttpError(status: number, headers: Record<string, string> = {}) {
  return JSON.stringify({ data: { status_code: status }, headers, status });
}

function search(q?: string) {
  const url = q == null ? "http://localhost/api/v1/pools/search" : `http://localhost/api/v1/pools/search?q=${encodeURIComponent(q)}`;
  return GET(new Request(url));
}

beforeEach(() => {
  resetPoolIndexForTests();
  mocks.get.mockReset();
  mocks.get.mockImplementation(async (path: string) =>
    path === "/pools/extended?count=100&page=1" ? POOLS : []
  );
});

it("finds a pool by ticker, in the documented shape", async () => {
  const response = await search("epo");
  const body = PoolSearchResponseSchema.parse(await response.json());

  expect(response.status).toBe(200);
  expect(body.pools.map((pool) => pool.poolId)).toEqual(["pool1epora"]);
});

it("returns the shortlist when there is no query", async () => {
  const body = PoolSearchResponseSchema.parse(await (await search()).json());

  expect(body.pools).toHaveLength(2);
});

it("rejects an over-long query before reading the chain", async () => {
  const response = await search("x".repeat(POOL_SEARCH_QUERY_MAX_LENGTH + 1));

  expect(response.status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("asks a rate-limited client to wait out the whole rebuild backoff", async () => {
  // Blockfrost's own 20 s sent the client back while the 30 s backoff still ran.
  mocks.get.mockRejectedValue(meshHttpError(429, { "Retry-After": "20" }));

  const response = await search("epo");

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("30");
});

it("keeps a provider Retry-After longer than the backoff", async () => {
  mocks.get.mockRejectedValue(meshHttpError(429, { "Retry-After": "90" }));

  expect((await search("epo")).headers.get("Retry-After")).toBe("90");
});

it("answers a search during the backoff without calling Blockfrost again", async () => {
  mocks.get.mockRejectedValue(meshHttpError(429, { "Retry-After": "20" }));
  await search("epo");
  const callsAfterFailure = mocks.get.mock.calls.length;

  const replay = await search("epo");

  expect(replay.status).toBe(429);
  // The time left in the 30 s backoff, not Blockfrost's original 20 s.
  expect(Number(replay.headers.get("Retry-After"))).toBeGreaterThan(20);
  expect(mocks.get.mock.calls.length).toBe(callsAfterFailure);
});

it("answers 502 when Blockfrost is down", async () => {
  mocks.get.mockRejectedValue(meshHttpError(503));

  expect((await search("epo")).status).toBe(502);
});
