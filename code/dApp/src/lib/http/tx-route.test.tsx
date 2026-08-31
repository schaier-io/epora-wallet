import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// `tx-route` is a server module. vitest.config.ts aliases `server-only` to an
// empty stub so the handler can be exercised here; nothing it imports needs a
// real server.

// A real counting limiter, not a stub that always allows: the point of this
// file is to prove the caps bind, and a stub would prove nothing.
const buckets = vi.hoisted(() => new Map<string, number>());
vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: (_request: Request, scope: string) => `${scope}:test-caller`,
  rateLimit: vi.fn(async (key: string, limit: number) => {
    const used = (buckets.get(key) ?? 0) + 1;
    buckets.set(key, used);
    return { ok: used <= limit, retryAfterSeconds: used <= limit ? 0 : 42 };
  })
}));

// No chain access from a unit test. The address guard is exercised by
// server-wallet.test.ts.
vi.mock("@/lib/mesh/server-wallet", () => ({
  ServerWalletAddressError: class ServerWalletAddressError extends Error {},
  createAddressWalletSource: () => ({
    getUtxos: async () => [],
    getChangeAddress: async () => "addr_test1caller",
    getUsedAddresses: async () => ["addr_test1caller"],
    getUnusedAddresses: async () => []
  }),
  createServerTxFetcher: () => providerCalls.fetcher
}));

// Stands in for the chain client. Every build would touch it; counting it is
// how we see whether the limiter stopped work before it reached the provider.
const providerCalls = vi.hoisted(() => ({
  count: 0,
  fetcher: {} as unknown,
  reset() {
    this.count = 0;
  }
}));

import { createTxRoute } from "@/lib/http/tx-route";

const ADDRESS =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";

const RESULT = {
  txHex: "84a0",
  preview: {
    action: "test",
    summary: "A test transaction",
    cbor: "84a0",
    txSize: { usedBytes: 2, maxBytes: 16384, percentage: "0.01" }
  },
  estimatedFeeLovelace: "170000",
  executionUnits: {
    memUsed: "0",
    stepsUsed: "0",
    maxTxMem: "17500000",
    maxTxSteps: "10000000000",
    maxBlockMem: "77500000",
    maxBlockSteps: "20000000000",
    redeemers: [],
    perValidator: []
  }
};

function createRoute() {
  return createTxRoute({
    name: "test-build",
    schema: z.object({ address: z.string() }),
    build: async () => {
      // Every build spends provider requests. Counting here is the
      // "mock chain client shows the provider calls stop at the cap" check.
      providerCalls.count += 1;
      return RESULT;
    }
  });
}

function request() {
  return new Request("http://localhost/api/v1/tx/test-build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: ADDRESS })
  });
}

describe("createTxRoute rate limiting", () => {
  beforeEach(() => {
    buckets.clear();
    providerCalls.reset();
    process.env.TX_RATE_LIMIT_REQUESTS = "3";
    process.env.TX_RATE_LIMIT_GLOBAL_REQUESTS = "100";
  });

  afterEach(() => {
    delete process.env.TX_RATE_LIMIT_REQUESTS;
    delete process.env.TX_RATE_LIMIT_GLOBAL_REQUESTS;
    delete process.env.TX_RATE_LIMIT_GLOBAL_WINDOW_MS;
  });

  it("stops the flood at the per-client cap, before any provider call", async () => {
    const POST = createRoute();
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await POST(request())).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
    // The three refused requests never reached the builder, so they cost the
    // chain provider nothing. That is the whole point of the cap.
    expect(providerCalls.count).toBe(3);
  });

  it("answers 429 with Retry-After and the documented body", async () => {
    const POST = createRoute();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await POST(request());
    }

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({
      error: "Too many transaction builds. Try again shortly."
    });
  });

  it("counts every build route into one per-client bucket", async () => {
    const mint = createTxRoute({
      name: "mint",
      schema: z.object({ address: z.string() }),
      build: async () => {
        providerCalls.count += 1;
        return RESULT;
      }
    });
    const lock = createTxRoute({
      name: "lock-funds",
      schema: z.object({ address: z.string() }),
      build: async () => {
        providerCalls.count += 1;
        return RESULT;
      }
    });

    expect((await mint(request())).status).toBe(200);
    expect((await lock(request())).status).toBe(200);
    expect((await mint(request())).status).toBe(200);
    // A per-route bucket would allow this one. A tier-wide bucket does not.
    expect((await lock(request())).status).toBe(429);
    expect(providerCalls.count).toBe(3);
  });

  it("stops a flood spread across callers at the deployment cap", async () => {
    process.env.TX_RATE_LIMIT_REQUESTS = "1000";
    process.env.TX_RATE_LIMIT_GLOBAL_REQUESTS = "2";
    const POST = createRoute();

    const first = await POST(request());
    const second = await POST(request());
    const third = await POST(request());

    expect([first.status, second.status, third.status]).toEqual([200, 200, 429]);
    expect(await third.json()).toEqual({
      error: "The service is building too many transactions right now. Try again shortly."
    });
    expect(providerCalls.count).toBe(2);
  });
});
