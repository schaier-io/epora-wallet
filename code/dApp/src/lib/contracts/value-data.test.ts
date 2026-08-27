import assert from "node:assert/strict";
import test from "node:test";
import {
  parseValueData,
  serializeAssetsToValueData,
  valueEntriesToAssets
} from "@/lib/contracts/value-data";

test("serializeAssetsToValueData normalizes duplicates, zeros, and ordering", () => {
  assert.deepEqual(
    serializeAssetsToValueData(
      [
        { unit: "lovelace", quantity: "2" },
        { unit: `${"aa".repeat(28)}01`, quantity: "3" },
        { unit: `${"AA".repeat(28)}01`, quantity: "4" },
        { unit: "lovelace", quantity: "0" }
      ],
      "Test value"
    ),
    [
      { alternative: 0, fields: ["", "", 2] },
      { alternative: 0, fields: [`${"aa".repeat(28)}`, "01", 7] }
    ]
  );
});

test("native assets may use an empty asset name", () => {
  const unit = "cc".repeat(28);
  assert.deepEqual(serializeAssetsToValueData([{ unit, quantity: "1" }]), [
    { alternative: 0, fields: [unit, "", 1] }
  ]);
});

test("asset ids reject malformed policy hashes and oversized names", () => {
  assert.throws(
    () => serializeAssetsToValueData([{ unit: "aa".repeat(27), quantity: "1" }]),
    /must include a 56-character policy ID/
  );
  assert.throws(
    () =>
      serializeAssetsToValueData([
        { unit: `${"aa".repeat(28)}${"bb".repeat(33)}`, quantity: "1" }
      ]),
    /hex-encoded asset name no longer than 64 characters/
  );
});

test("parseValueData round-trips normalized asset entries", () => {
  const encoded = [
    { alternative: 0, fields: ["", "", 5] },
    { alternative: 0, fields: [`${"bb".repeat(28)}`, "cafe", 9] }
  ];

  const parsed = parseValueData(encoded, "Round-trip value");

  assert.deepEqual(valueEntriesToAssets(parsed), [
    { unit: "lovelace", quantity: "5" },
    { unit: `${"bb".repeat(28)}cafe`, quantity: "9" }
  ]);
});
