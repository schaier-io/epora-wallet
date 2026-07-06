import assert from "node:assert/strict";
import test from "node:test";
import { formatLogLine, serializeError } from "@/lib/observability/logger";

test("formatLogLine emits a single-line JSON object with the core fields", () => {
  const line = formatLogLine("info", "wallet.connected", { walletId: "w1" }, "2026-07-02T00:00:00.000Z");
  assert.equal(line.includes("\n"), false);
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "wallet.connected");
  assert.equal(parsed.ts, "2026-07-02T00:00:00.000Z");
  assert.equal(parsed.walletId, "w1");
});

test("formatLogLine stringifies bigint context instead of throwing", () => {
  const line = formatLogLine("error", "datum.decoded", { lovelace: 1_000_000n }, "2026-07-02T00:00:00.000Z");
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.equal(parsed.lovelace, "1000000");
});

test("serializeError keeps only name, message, stack and the cause chain", () => {
  const root = new Error("db unavailable");
  const wrapped = new Error("query failed", { cause: root }) as Error & { secret?: string };
  wrapped.secret = "do-not-log-me";
  const payload = serializeError(wrapped);
  assert.equal(payload.name, "Error");
  assert.equal(payload.message, "query failed");
  assert.ok(typeof payload.stack === "string");
  assert.deepEqual((payload.cause as Record<string, unknown>).message, "db unavailable");
  // Arbitrary enumerable props (which may carry secrets) are not forwarded.
  assert.equal("secret" in payload, false);
});

test("serializeError wraps non-Error values into a message", () => {
  assert.deepEqual(serializeError("boom"), { message: "boom" });
  assert.deepEqual(serializeError(404), { message: "404" });
});
