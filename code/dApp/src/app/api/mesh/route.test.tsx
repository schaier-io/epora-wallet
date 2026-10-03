// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type * as BlockfrostServer from "@/lib/mesh/blockfrost-server";
import type * as Logger from "@/lib/observability/logger";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), limit: vi.fn(), pair: vi.fn() }));
vi.mock("@/lib/mesh/blockfrost-server", async (original) => ({
  ...await original<typeof BlockfrostServer>(),
  getBlockfrostProvider: () => ({}),
  executeMeshMethod: mocks.execute
}));
vi.mock("@/lib/http/rate-limit", () => ({ clientKey: () => "caller", rateLimit: mocks.limit, rateLimitPair: mocks.pair }));
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
  mocks.limit.mockReset().mockResolvedValue({ ok: true });
  mocks.pair.mockReset().mockResolvedValue({ primary: { ok: true }, secondary: { ok: true } });
  vi.mocked(logger.error).mockReset();
  vi.mocked(logger.warn).mockReset();
});

function request(body = '{"method":"fetchAddressUTxOs","args":["address"]}', hint?: string) {
  return new Request("http://localhost/api/mesh", { method: "POST", body,
    ...(hint ? { headers: { "X-Mesh-Method": hint } } : {}) });
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

it("recovers a transient upstream read before logging an error", async () => {
  mocks.execute.mockRejectedValueOnce(JSON.stringify({ status: 500 })).mockResolvedValueOnce([]);
  expect((await POST(request())).status).toBe(200);
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(logger.error).not.toHaveBeenCalled();
});

it("bounds upstream read retries and maps an exhausted outage to 502", async () => {
  mocks.execute.mockRejectedValue(JSON.stringify({ status: 503 }));
  expect((await POST(request())).status).toBe(502);
  expect(mocks.execute).toHaveBeenCalledTimes(3);
  expect(logger.error).toHaveBeenCalledTimes(1);
});

it.each(["submitTx", "evaluateTx"])("never retries %s during an upstream outage", async (method) => {
  mocks.execute.mockRejectedValue(JSON.stringify({ status: 500 }));
  expect((await POST(request(JSON.stringify({ method, args: ["00"] })))).status).toBe(502);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
});

it.each(["evaluateTx", "submitTx"])("charges both %s buckets with one paired call when hinted", async method => {
  mocks.execute.mockResolvedValue([]);
  expect((await POST(request(JSON.stringify({ method, args: ["00"] }), method))).status).toBe(200);
  expect(mocks.pair).toHaveBeenCalledExactlyOnceWith(
    { key: "caller", limit: 1200, windowMs: 60_000 },
    { key: `caller:${method}`, limit: 200, windowMs: 60_000 }
  );
  expect(mocks.limit).not.toHaveBeenCalled();
});

it("rejects the primary bucket before reading invalid JSON", async () => {
  mocks.pair.mockResolvedValue({ primary: { ok: false, retryAfterSeconds: 17 } });
  const response = await POST(request("{", "evaluateTx"));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("17");
  expect(mocks.limit).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("preserves the secondary retry hint and blocks evaluation", async () => {
  mocks.pair.mockResolvedValue({ primary: { ok: true }, secondary: { ok: false, retryAfterSeconds: 23 } });
  const response = await POST(request('{"method":"evaluateTx","args":["00"]}', "evaluateTx"));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("23");
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("checks the actual expensive method when the hint differs", async () => {
  mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 9 });
  const response = await POST(request('{"method":"evaluateTx","args":["00"]}', "submitTx"));
  expect(response.status).toBe(429);
  expect(mocks.pair).toHaveBeenCalledTimes(1);
  expect(mocks.limit).toHaveBeenCalledExactlyOnceWith("caller:evaluateTx", 200, 60_000);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it.each([undefined, "fetchAddressUTxOs", "EvaluateTx", "untrusted"])("keeps legacy debits for hint %s", async hint => {
  mocks.execute.mockResolvedValue([]);
  expect((await POST(request('{"method":"evaluateTx","args":["00"]}', hint))).status).toBe(200);
  expect(mocks.pair).not.toHaveBeenCalled();
  expect(mocks.limit.mock.calls).toEqual([["caller", 1200, 60_000], ["caller:evaluateTx", 200, 60_000]]);
});

it("a false expensive hint does not block an allowed read method", async () => {
  mocks.pair.mockResolvedValue({ primary: { ok: true }, secondary: { ok: false, retryAfterSeconds: 23 } });
  mocks.execute.mockResolvedValue([]);
  expect((await POST(request(undefined, "submitTx"))).status).toBe(200);
  expect(mocks.limit).not.toHaveBeenCalled();
});

it("invalid hinted bodies retain their bounded parsing errors", async () => {
  mocks.pair.mockResolvedValue({ primary: { ok: true }, secondary: { ok: false, retryAfterSeconds: 23 } });
  expect((await POST(request("{", "evaluateTx"))).status).toBe(400);
  expect((await POST(request('{"method":"invalid"}', "evaluateTx"))).status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it.each(["success", "input-error", "upstream-error", "rate-error"])("returns only numeric server timing for %s", async outcome => {
  mocks.execute.mockResolvedValue([]);
  if (outcome === "upstream-error") mocks.execute.mockRejectedValue(new Error("secret-provider-detail"));
  if (outcome === "rate-error") mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 5 });
  const response = await POST(request(outcome === "input-error" ? "{" : undefined));
  const timing = response.headers.get("Server-Timing");
  expect(timing).toMatch(/^rate_limit;dur=\d+\.\d, provider;dur=\d+\.\d, total;dur=\d+\.\d$/);
  expect(timing).not.toContain("secret");
  if (outcome === "input-error" || outcome === "rate-error") expect(timing).toContain("provider;dur=0.0");
});

it("returns timed failure when the rate-limit store fails", async () => {
  mocks.limit.mockRejectedValue(new Error("database unavailable"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(response.headers.get("Server-Timing")).toContain("provider;dur=0.0");
  expect(mocks.execute).not.toHaveBeenCalled();
});
