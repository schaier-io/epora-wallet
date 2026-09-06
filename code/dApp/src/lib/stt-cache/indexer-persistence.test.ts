import assert from "node:assert/strict";
import test from "node:test";
import { parseJsonSafe } from "@/lib/proposals/serialization";
import { stringifyJson } from "./indexer-persistence";

test("cache JSON preserves bigint datum integers", () => {
  const datum = {
    alternative: 0,
    fields: [9_007_199_254_740_992n]
  };

  assert.deepEqual(parseJsonSafe(stringifyJson(datum)), datum);
});
