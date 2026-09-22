import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "governance-actions:test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/mesh/blockfrost-server", () => ({
  getBlockfrostProvider: () => ({ get: mocks.get })
}));

import { GET } from "./route";

const TX_HASH = "0ecc74fe26532cec1ab9a299f082afc436afc888ca2dc0fc6acda431c52dc60d";
const GOV_ACTION_ID = "gov_action1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsq6dmejn";

const PROPOSAL = {
  id: GOV_ACTION_ID,
  tx_hash: TX_HASH,
  cert_index: 0,
  governance_type: "treasury_withdrawals",
  expiration: 240,
  ratified_epoch: null,
  enacted_epoch: null,
  dropped_epoch: null,
  expired_epoch: null
};

function meshHttpError(status: number) {
  return JSON.stringify({ data: { status_code: status }, headers: {}, status });
}

async function actionOf(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json()) as { action: Record<string, unknown> }).action;
}

function get(id: string) {
  return GET(new Request(`http://localhost/api/v1/governance-actions?id=${encodeURIComponent(id)}`));
}

beforeEach(() => {
  mocks.get.mockReset();
});

it("rejects a malformed id before calling Blockfrost", async () => {
  const response = await get("not-an-id");

  expect(response.status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("looks a tx-hash#index id up by its hash and index", async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/metadata")) throw meshHttpError(404);
    return PROPOSAL;
  });

  const response = await get(`${TX_HASH.toUpperCase()}#0`);

  expect(response.status).toBe(200);
  expect(mocks.get).toHaveBeenCalledWith(`/governance/proposals/${TX_HASH}/0`);
  expect(await actionOf(response)).toMatchObject({ txHash: TX_HASH, index: 0, title: null, status: "active" });
});

it("reads the CIP-108 title and abstract, also when Blockfrost returns them as a string", async () => {
  mocks.get.mockImplementation(async (url: string) =>
    url.endsWith("/metadata")
      ? { json_metadata: JSON.stringify({ body: { title: "Fund the node", abstract: "Pay for a year." } }) }
      : PROPOSAL
  );

  const response = await get(GOV_ACTION_ID);

  expect(mocks.get).toHaveBeenCalledWith(`/governance/proposals/${GOV_ACTION_ID}`);
  expect(await actionOf(response)).toMatchObject({ title: "Fund the node", abstract: "Pay for a year." });
});

it("reports a closed action as closed, not active", async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/metadata")) throw meshHttpError(404);
    return { ...PROPOSAL, expired_epoch: 241, dropped_epoch: 241 };
  });

  expect((await actionOf(await get(GOV_ACTION_ID))).status).toBe("expired");
});

it("still returns the action when only its metadata request fails", async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/metadata")) throw meshHttpError(503);
    return PROPOSAL;
  });

  const response = await get(GOV_ACTION_ID);

  expect(response.status).toBe(200);
  expect(await actionOf(response)).toMatchObject({ txHash: TX_HASH, title: null, abstract: null });
});

it("answers a malformed id Blockfrost rejected as a caller error, not a server failure", async () => {
  mocks.get.mockRejectedValue(meshHttpError(400));

  const response = await get(GOV_ACTION_ID);

  expect(response.status).toBe(400);
});

it("answers 404 only when Blockfrost has no such action", async () => {
  mocks.get.mockRejectedValue(meshHttpError(404));

  expect((await get(GOV_ACTION_ID)).status).toBe(404);
});

it("does not report an upstream failure as a missing action", async () => {
  mocks.get.mockRejectedValue(meshHttpError(429));

  const response = await get(GOV_ACTION_ID);

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Governance action lookup failed." });
});
