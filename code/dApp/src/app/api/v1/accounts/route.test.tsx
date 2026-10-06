import { beforeEach, expect, it, vi } from "vitest";
import { AccountsResponseSchema } from "@/lib/api/accounts";
import { bech32Decode } from "@/lib/bech32";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "accounts:test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/mesh/blockfrost-server", () => ({
  getBlockfrostProvider: () => ({ get: mocks.get })
}));

import { GET } from "./route";

// CIP-19 test vector: a testnet reward address with a script credential.
const STAKE_ADDRESS = "stake_test17rphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcljw6kf";
const DREP_ID = "drep1ygqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq7vlc9n";

function meshHttpError(status: number, headers: Record<string, string> = {}) {
  return JSON.stringify({ data: { status_code: status }, headers, status });
}

function get(address = STAKE_ADDRESS) {
  return GET(new Request(`http://localhost/api/v1/accounts?address=${encodeURIComponent(address)}`));
}

async function accountOf(response: Response) {
  expect(response.status).toBe(200);
  const parsed = AccountsResponseSchema.safeParse(await response.json());
  expect(parsed.success).toBe(true);
  return parsed.data!.account;
}

beforeEach(() => {
  mocks.get.mockReset();
});

it("uses a test address with a valid checksum", () => {
  expect(bech32Decode(STAKE_ADDRESS)?.hrp).toBe("stake_test");
});

it("rejects a missing address without calling Blockfrost", async () => {
  const response = await GET(new Request("http://localhost/api/v1/accounts"));

  expect(response.status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("rejects a mainnet address on a testnet deployment", async () => {
  const response = await get("stake178phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcccycj5");

  expect(response.status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("reads registration and both delegations", async () => {
  mocks.get.mockResolvedValue({ registered: true, active: true, pool_id: "pool1abc", drep_id: DREP_ID });

  expect(await accountOf(await get())).toEqual({
    stakeAddress: STAKE_ADDRESS,
    registered: true,
    poolId: "pool1abc",
    drepId: DREP_ID
  });
});

it("does not read a delegated address as registered unless Blockfrost says so", async () => {
  // Mesh's `active` folds delegation into one flag; only `registered` answers this.
  mocks.get.mockResolvedValue({ registered: false, active: true, pool_id: null, drep_id: null });

  expect((await accountOf(await get())).registered).toBe(false);
});

it("answers an address the chain has never seen as not registered", async () => {
  mocks.get.mockRejectedValue(meshHttpError(404));

  expect(await accountOf(await get())).toEqual({
    stakeAddress: STAKE_ADDRESS,
    registered: false,
    poolId: null,
    drepId: null
  });
});

it("answers a Blockfrost outage as 502", async () => {
  mocks.get.mockRejectedValue(meshHttpError(503));

  expect((await get()).status).toBe(502);
});

it("passes Blockfrost's rate limit on as a 429 with its Retry-After", async () => {
  mocks.get.mockRejectedValue(meshHttpError(429, { "Retry-After": "7" }));

  const response = await get();

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("7");
});

it("keeps 500 for a failure that is not the provider's", async () => {
  mocks.get.mockRejectedValue(new TypeError("boom"));

  const response = await get();

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Account lookup failed." });
});
