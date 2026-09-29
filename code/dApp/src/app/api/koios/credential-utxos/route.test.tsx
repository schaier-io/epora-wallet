// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type * as KoiosServer from "@/lib/discovery/koios-server";

const mocks = vi.hoisted(() => ({ fetchRows: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/discovery/koios-server", async (original) => ({
  ...(await original<typeof KoiosServer>()),
  fetchKoiosCredentialUtxoRows: mocks.fetchRows
}));

import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { POST } from "./route";

const CREDENTIAL = "cc".repeat(28);

function request(body: unknown) {
  return new Request("http://localhost/api/koios/credential-utxos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  mocks.fetchRows.mockReset().mockResolvedValue([]);
});

it("looks up the server's own network", async () => {
  const response = await POST(request({ paymentCredential: CREDENTIAL, network: CARDANO_NETWORK }));

  expect(response.status).toBe(200);
  expect(mocks.fetchRows).toHaveBeenCalledWith(CREDENTIAL, CARDANO_NETWORK);
});

it("refuses a client-chosen network the server does not serve", async () => {
  const other = CARDANO_NETWORK === "mainnet" ? "preprod" : "mainnet";

  const response = await POST(request({ paymentCredential: CREDENTIAL, network: other }));

  expect(response.status).toBe(400);
  expect(mocks.fetchRows).not.toHaveBeenCalled();
});

it.each(["toString", "__proto__", "constructor"])("rejects the inherited key %s as a network", async (network) => {
  const response = await POST(request({ paymentCredential: CREDENTIAL, network }));

  expect(response.status).toBe(400);
  expect(mocks.fetchRows).not.toHaveBeenCalled();
});

it.each([null, [], 7, { paymentCredential: 1 }])("answers 400, not 500, for the body %j", async (body) => {
  const response = await POST(request(body));

  expect(response.status).toBe(400);
});
