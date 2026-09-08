// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type * as BlockfrostServer from "@/lib/mesh/blockfrost-server";
import type * as Logger from "@/lib/observability/logger";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/mesh/blockfrost-server", async (original) => ({
  ...await original<typeof BlockfrostServer>(),
  getBlockfrostProvider: () => ({}),
  executeMeshMethod: mocks.execute
}));
vi.mock("@/lib/http/rate-limit", () => ({ clientKey: () => "caller", rateLimit: mocks.limit }));
vi.mock("@/lib/observability/logger", async (original) => ({
  ...await original<typeof Logger>(),
  logger: { error: vi.fn() }
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { POST } from "./route";
import { BlockfrostResponseError } from "@/lib/mesh/blockfrost-reads";
import { MeshRpcInputError } from "@/lib/mesh/blockfrost-server";

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.limit.mockResolvedValue({ ok: true });
});

function request(body = '{"method":"fetchAddressUTxOs","args":["address"]}') {
  return new Request("http://localhost/api/mesh", { method: "POST", body });
}

it("preserves provider rate limits and the retry header", async () => {
  mocks.execute.mockRejectedValue(JSON.stringify({ status: 429, headers: { "retry-after": "17" }, data: { message: "Too many requests" } }));
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("17");
  expect(JSON.stringify(await response.json())).toContain("Too many requests");
});

it("reports invalid upstream data as a gateway failure", async () => {
  mocks.execute.mockRejectedValue(new BlockfrostResponseError("addresses/utxos", new Error("invalid payload")));
  expect((await POST(request())).status).toBe(502);
});

it("keeps input errors out of retryable server failures", async () => {
  mocks.execute.mockRejectedValue(new MeshRpcInputError("Invalid cursor"));
  expect((await POST(request())).status).toBe(400);
  expect((await POST(request("{"))).status).toBe(400);
  expect((await POST(request('{"method":"invalid"}'))).status).toBe(400);
});

it("preserves provider transaction failure text", async () => {
  mocks.execute.mockRejectedValue(JSON.stringify({ status: 400, data: { message: "PPViewHashesDontMatch" } }));
  const response = await POST(request('{"method":"submitTx","args":["00"]}'));
  expect(response.status).toBe(400);
  expect(JSON.stringify(await response.json())).toContain("PPViewHashesDontMatch");
});
