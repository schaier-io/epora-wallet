import assert from "node:assert/strict";
import test from "node:test";

import { getErrorMessage, serializeErrorForResponse } from "./errors";

// serializeErrorForResponse exposes internals outside production, which is how
// these tests reach the private toJsonSafe (NODE_ENV under the test runner is
// not "production").

test("serializeErrorForResponse keeps a shared acyclic reference in both branches", () => {
  const shared = { unit: "lovelace", quantity: "42" };
  const payload = serializeErrorForResponse({ a: shared, b: shared });
  assert.deepEqual(payload, {
    a: { unit: "lovelace", quantity: "42" },
    b: { unit: "lovelace", quantity: "42" },
  });
});

test("serializeErrorForResponse cuts a genuine cycle with [Circular]", () => {
  const cyclic: Record<string, unknown> = { name: "loop" };
  cyclic.self = cyclic;
  const payload = serializeErrorForResponse(cyclic);
  assert.equal(payload.name, "loop");
  assert.equal(payload.self, "[Circular]");
});

test("serializeErrorForResponse survives a sibling array repeating one object", () => {
  const entry = { policy: "abc" };
  const payload = serializeErrorForResponse({ assets: [entry, entry, entry] });
  assert.deepEqual(payload.assets, [{ policy: "abc" }, { policy: "abc" }, { policy: "abc" }]);
});

test("serializeErrorForResponse stringifies bigints so the response can JSON.stringify", () => {
  const payload = serializeErrorForResponse({ mem: 1224833n });
  assert.equal(payload.mem, "1224833");
  assert.doesNotThrow(() => JSON.stringify(payload));
});

test("getErrorMessage falls back through message/info to the default", () => {
  assert.equal(getErrorMessage(new Error("boom")), "boom");
  assert.equal(getErrorMessage({ info: "from info" }), "from info");
  assert.equal(getErrorMessage(undefined, "fallback"), "fallback");
});
