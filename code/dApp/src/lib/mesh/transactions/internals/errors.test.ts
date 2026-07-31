import assert from "node:assert/strict";
import test from "node:test";
import {
  collectErrorText,
  createStageError,
  createTxPreview,
  normalizeError,
  withStage
} from "@/lib/mesh/transactions/internals/errors";

test("normalizeError serializes an Error with name and message", () => {
  const payload = normalizeError(new Error("boom"));
  assert.equal(payload.name, "Error");
  assert.equal(payload.message, "boom");
  assert.ok(typeof payload.stack === "string");
});

test("normalizeError carries stage / cause / details when present", () => {
  const err = new Error("boom") as Error & Record<string, unknown>;
  err.stage = "Build";
  err.cause = "root";
  err.details = { hint: "x" };
  const payload = normalizeError(err);
  assert.equal(payload.stage, "Build");
  assert.equal(payload.cause, "root");
  assert.deepEqual(payload.details, { hint: "x" });
});

test("normalizeError passes a plain record through and wraps primitives", () => {
  assert.deepEqual(normalizeError({ info: "already-structured" }), { info: "already-structured" });
  assert.deepEqual(normalizeError(42), { value: "42" });
});

test("createStageError wraps into a MeshBuildError with stage metadata", () => {
  const wrapped = createStageError("Sign", new Error("bad witness"), { txid: "abc" });
  assert.equal(wrapped.name, "MeshBuildError");
  assert.equal(wrapped.stage, "Sign");
  assert.match(wrapped.message, /^\[Sign\] bad witness$/);
  assert.equal(wrapped.details?.txid, "abc");
  assert.ok(wrapped.details?.sourceError);
});

test("createStageError prefers a structured `info` message when the source has one", () => {
  const wrapped = createStageError("Submit", { info: "node rejected tx" });
  assert.match(wrapped.message, /^\[Submit\] node rejected tx$/);
});

test("withStage returns the operation result on success", async () => {
  const result = await withStage("Fetch", async () => 123);
  assert.equal(result, 123);
});

test("withStage rethrows failures as stage errors", async () => {
  await assert.rejects(
    () => withStage("Fetch", async () => {
      throw new Error("network down");
    }),
    (err: Error & { stage?: string }) => {
      assert.equal(err.name, "MeshBuildError");
      assert.equal(err.stage, "Fetch");
      assert.match(err.message, /network down/);
      return true;
    }
  );
});

test("collectErrorText gathers strings from nested errors and records", () => {
  const inner = new Error("inner failure");
  const outer = new Error("outer failure") as Error & { cause?: unknown };
  outer.cause = inner;
  const messages = collectErrorText({ note: "extra note", err: outer });
  assert.ok(messages.has("extra note"));
  assert.ok(messages.has("outer failure"));
  assert.ok(messages.has("inner failure"));
});

test("createTxPreview attaches a computed tx-size summary", () => {
  const preview = createTxPreview("Spend", "one output", "abcd");
  assert.equal(preview.action, "Spend");
  assert.equal(preview.summary, "one output");
  assert.equal(preview.cbor, "abcd");
  assert.equal(preview.txSize.usedBytes, 2); // ceil(4 hex chars / 2)
  assert.ok(preview.txSize.maxBytes > 0);
});
