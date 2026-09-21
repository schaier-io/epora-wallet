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
  logger: { error: vi.fn(), warn: vi.fn() }
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { POST } from "./route";
import { BlockfrostResponseError } from "@/lib/mesh/blockfrost-reads";
import { MeshRpcInputError } from "@/lib/mesh/blockfrost-server";
import { logger } from "@/lib/observability/logger";

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.limit.mockResolvedValue({ ok: true });
  vi.mocked(logger.error).mockReset();
  vi.mocked(logger.warn).mockReset();
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
  expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
});

it("reports invalid upstream data as a gateway failure", async () => {
  mocks.execute.mockRejectedValue(new BlockfrostResponseError("addresses/utxos", new Error("invalid payload")));
  expect((await POST(request())).status).toBe(502);
  expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
});

it.each(["fetchTxInfo", "fetchAccountInfo"])("keeps %s provider 404s out of the error log", async (method) => {
  mocks.execute.mockRejectedValue(JSON.stringify({
    status: 404,
    data: { status_code: 404, error: "Not Found", message: "The requested component has not been found." }
  }));
  const response = await POST(request(JSON.stringify({ method, args: ["00"] })));
  expect(response.status).toBe(404);
  expect(JSON.stringify(await response.json())).toContain("The requested component has not been found.");
  expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
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
  expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
});

// Blockfrost answers HTTP 200 for an evaluation that failed, so Mesh throws the
// Ogmios body itself, doubly JSON-encoded.
function ogmiosEvaluationFailure(failure: unknown) {
  return JSON.stringify(JSON.stringify({
    type: "jsonwsp/response",
    version: "1.0",
    servicename: "ogmios",
    methodname: "EvaluateTx",
    result: { EvaluationFailure: failure },
    reflection: { id: "0f806463" }
  }));
}

it.each([
  ["an empty", {}],
  ["a populated", { "spend:0": ["validator refused"] }]
])("answers 422 and skips the error log for %s ScriptFailures map", async (_label, scriptFailures) => {
  mocks.execute.mockRejectedValue(ogmiosEvaluationFailure({ ScriptFailures: scriptFailures }));
  const response = await POST(request('{"method":"evaluateTx","args":["00"]}'));
  expect(response.status).toBe(422);
  // The build client classifies the rejection off this text, so it must survive.
  expect(JSON.stringify(await response.json())).toContain("ScriptFailures");
  expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
    "api.mesh_script_evaluation_rejected",
    expect.objectContaining({ method: "evaluateTx" })
  );
});

it("keeps an evaluator failure that is not a script rejection loud", async () => {
  mocks.execute.mockRejectedValue(ogmiosEvaluationFailure({ CannotCreateEvaluationContext: { reason: "unresolved inputs" } }));
  const response = await POST(request('{"method":"evaluateTx","args":["00"]}'));
  expect(response.status).toBe(500);
  expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
    "api.mesh_request_failed",
    expect.objectContaining({ method: "evaluateTx" })
  );
});
