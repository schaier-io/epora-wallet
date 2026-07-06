import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTxSizeSummary,
  plutusScriptSizeBytes
} from "@/lib/mesh/transactions/internals/script-data";

test("buildTxSizeSummary reports byte usage from a hex string", () => {
  const summary = buildTxSizeSummary("abcd12"); // 6 hex chars => 3 bytes
  assert.equal(summary.usedBytes, 3);
  assert.ok(summary.maxBytes > 0);
  // percentage is a fixed(2) string relative to the protocol max tx size
  assert.match(summary.percentage, /^\d+\.\d{2}$/);
});

test("buildTxSizeSummary rounds an odd-length hex string up to whole bytes", () => {
  assert.equal(buildTxSizeSummary("abc").usedBytes, 2); // ceil(3/2)
  assert.equal(buildTxSizeSummary("").usedBytes, 0);
});

test("plutusScriptSizeBytes measures a script's compiled code length", () => {
  assert.equal(plutusScriptSizeBytes({ code: "deadbeef" }), 4);
  assert.equal(plutusScriptSizeBytes({ code: "" }), 0);
});
