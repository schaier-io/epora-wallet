import assert from "node:assert/strict";
import test from "node:test";
import { formatLogLine, serializeError, serializeErrorDetail } from "@/lib/observability/logger";

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

test("serializeErrorDetail keeps the message chain but never a stack", () => {
  const root = new Error("EvaluationFailure");
  const wrapped = new Error("request failed", { cause: root });
  const payload = serializeErrorDetail(wrapped);
  assert.equal(payload.name, "Error");
  assert.equal(payload.message, "request failed");
  assert.equal("stack" in payload, false);
  const cause = payload.cause as Record<string, unknown>;
  assert.equal(cause.message, "EvaluationFailure");
  assert.equal("stack" in cause, false);
});

test("serializeErrorDetail wraps non-Error values into a message", () => {
  assert.deepEqual(serializeErrorDetail("boom"), { message: "boom" });
  assert.deepEqual(serializeErrorDetail(404), { message: "404" });
});

test("serializeErrorDetail terminates on a cyclic cause chain", () => {
  const a = new Error("a") as Error & { cause?: unknown };
  const b = new Error("b", { cause: a });
  a.cause = b;

  const payload = serializeErrorDetail(b) as Record<string, unknown>;
  assert.equal(payload.message, "b");
  // b → a → b(again): the revisited `b` is truncated to name + message, so the
  // walk stops instead of looping (or overflowing) forever.
  const cause = payload.cause as Record<string, unknown>;
  assert.equal(cause.message, "a");
  const cycleBack = cause.cause as Record<string, unknown>;
  assert.equal(cycleBack.message, "b");
  assert.equal("cause" in cycleBack, false);
});

test("serializeError terminates on a cyclic cause chain too", () => {
  const a = new Error("a") as Error & { cause?: unknown };
  const b = new Error("b", { cause: a });
  a.cause = b;

  // The route logs the error before building the response detail, so the
  // logging serializer needs the same cycle guard as the response one.
  const payload = serializeError(b) as Record<string, unknown>;
  assert.equal(payload.message, "b");
  const cause = payload.cause as Record<string, unknown>;
  assert.equal(cause.message, "a");
  const cycleBack = cause.cause as Record<string, unknown>;
  assert.equal(cycleBack.message, "b");
  assert.equal("cause" in cycleBack, false);
});

test("formatLogLine: context cannot clobber the reserved ts/level/event fields", () => {
  const line = formatLogLine(
    "error",
    "real.event",
    { ts: "fake-ts", level: "info", event: "fake.event", walletId: "w1" },
    "2026-07-02T00:00:00.000Z"
  );
  const payload = JSON.parse(line) as Record<string, unknown>;
  assert.equal(payload.ts, "2026-07-02T00:00:00.000Z");
  assert.equal(payload.level, "error");
  assert.equal(payload.event, "real.event");
  assert.equal(payload.walletId, "w1");
});
