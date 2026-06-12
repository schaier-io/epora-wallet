import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonSafe, serializeJsonSafe } from "./serialization";

test("round-trips bigint values inside nested datum structures", () => {
  const value = {
    alternative: 0,
    fields: [123n, "abcd", { alternative: 1, fields: [9007199254740993n] }]
  };
  const restored = parseJsonSafe<typeof value>(serializeJsonSafe(value));
  assert.deepStrictEqual(restored, value);
  assert.equal(typeof restored.fields[0], "bigint");
});

test("round-trips Map values with bigint entries", () => {
  const value = new Map<string, bigint>([
    ["lovelace", 5_000_000n],
    ["asset", 1n]
  ]);
  const restored = parseJsonSafe<Map<string, bigint>>(serializeJsonSafe(value));
  assert.ok(restored instanceof Map);
  assert.equal(restored.get("lovelace"), 5_000_000n);
});

test("leaves plain JSON untouched", () => {
  const value = { builder: "stt-spend", config: { sttAssetNameHex: "00" }, list: [1, 2, 3] };
  assert.deepStrictEqual(parseJsonSafe(serializeJsonSafe(value)), value);
});
