import assert from "node:assert/strict";
import test from "node:test";
import { createAppQueryClient, queryRetryDelay, retryQuery } from "./client";

test("permanent failures and cancellation do not retry; transient reads are bounded", () => {
  for (const status of [400, 401, 403, 404, 422]) assert.equal(retryQuery(0, { status }), false);
  assert.equal(retryQuery(0, Object.assign(new Error("cancelled"), { name: "AbortError" })), false);
  for (const status of [408, 429, 502]) {
    assert.equal(retryQuery(0, { status }), true);
    assert.equal(retryQuery(2, { status }), false);
  }
  assert.equal(queryRetryDelay(0, { retryAfterMs: 2_000 }), 2_000);
});

test("signing mutations are neither retried nor paused for automatic offline replay", () => {
  const client = createAppQueryClient();
  assert.equal(client.getDefaultOptions().mutations?.retry, false);
  assert.equal(client.getDefaultOptions().mutations?.networkMode, "always");
  client.clear();
});
