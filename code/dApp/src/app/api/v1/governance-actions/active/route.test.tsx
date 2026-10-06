// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "governance-actions:test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));

import { GET } from "./route";

const TX_HASH = "0ecc74fe26532cec1ab9a299f082afc436afc888ca2dc0fc6acda431c52dc60d";
const GOV_ACTION_ID = "gov_action1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsq6dmejn";

const ROW = {
  proposal_id: GOV_ACTION_ID,
  proposal_tx_hash: TX_HASH,
  proposal_index: 1,
  proposal_type: "TreasuryWithdrawals",
  expiration: 324,
  meta_json: { body: { title: "Fund the node", abstract: "Pay for a year." } }
};

function get() {
  return GET(new Request("http://localhost/api/v1/governance-actions/active"));
}

beforeEach(() => {
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("asks Koios only for actions no epoch has closed yet", async () => {
  mocks.fetch.mockResolvedValue(Response.json([]));

  await get();

  const url = new URL(mocks.fetch.mock.calls[0][0] as string);
  expect(url.pathname).toMatch(/\/proposal_list$/);
  for (const epoch of ["ratified_epoch", "enacted_epoch", "dropped_epoch", "expired_epoch"]) {
    expect(url.searchParams.get(epoch)).toBe("is.null");
  }
});

it("maps Koios rows to open actions with snake-case types and CIP-108 text", async () => {
  mocks.fetch.mockResolvedValue(Response.json([ROW, { ...ROW, proposal_type: "InfoAction", meta_json: null }]));

  const response = await get();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    actions: [
      {
        id: GOV_ACTION_ID,
        txHash: TX_HASH,
        index: 1,
        type: "treasury_withdrawals",
        title: "Fund the node",
        abstract: "Pay for a year.",
        expirationEpoch: 324,
        status: "active"
      },
      expect.objectContaining({ type: "info_action", title: null, abstract: null })
    ]
  });
});

it("skips a row without an id, tx hash or index", async () => {
  mocks.fetch.mockResolvedValue(Response.json([{ ...ROW, proposal_index: null }, ROW]));

  const { actions } = (await (await get()).json()) as { actions: unknown[] };

  expect(actions).toHaveLength(1);
});

it("passes a Koios rate limit on with its Retry-After", async () => {
  mocks.fetch.mockResolvedValue(new Response("slow down", { status: 429, headers: { "Retry-After": "7" } }));

  const response = await get();

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("7");
});

it("reports a Koios outage or a malformed body as the provider being unavailable", async () => {
  mocks.fetch.mockResolvedValueOnce(new Response("down", { status: 503 }));
  expect((await get()).status).toBe(502);

  mocks.fetch.mockResolvedValueOnce(Response.json({ not: "a list" }));
  expect((await get()).status).toBe(502);

  mocks.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));
  expect((await get()).status).toBe(502);
});
