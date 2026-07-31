import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BUILD_CONTEXT_DEPTH, jsonDepthWithin, utf8ByteLength } from "./limits";

test("utf8ByteLength counts encoded bytes, not JavaScript code units", () => {
  assert.equal(utf8ByteLength("abc"), 3);
  assert.equal(utf8ByteLength("€"), 3);
});

test("jsonDepthWithin accepts the configured boundary and rejects one level beyond it", () => {
  let within: unknown = "leaf";
  for (let depth = 1; depth < MAX_BUILD_CONTEXT_DEPTH; depth++) {
    within = { child: within };
  }
  assert.equal(jsonDepthWithin(within, MAX_BUILD_CONTEXT_DEPTH), true);
  assert.equal(jsonDepthWithin({ child: within }, MAX_BUILD_CONTEXT_DEPTH), false);
});
