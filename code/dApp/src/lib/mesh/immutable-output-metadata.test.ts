import { test } from "node:test";
import assert from "node:assert/strict";
import { immutableOutputs } from "./immutable-output-metadata";
const HASH = "ab".repeat(32);
const output = () => ({ input: { txHash: HASH, outputIndex: 0 }, output: { address: "addr_test_fixture", amount: [{ unit: "lovelace", quantity: "100" }], dataHash: "ab", plutusData: "d87980", scriptRef: "abcd", scriptHash: "ab" } });
test("immutable output validation strips mutable and unknown provider fields without sharing objects", () => {
  const raw = { ...output(), status: "unspent", output: { ...output().output, consumed_by_tx: "tx" } };
  const clean = immutableOutputs([raw], HASH, 0);
  assert.deepEqual(clean, [output()]);
  clean![0]!.output.amount[0]!.quantity = "0";
  assert.equal(raw.output.amount[0]!.quantity, "100");
});
test("immutable output validation rejects wrong references, duplicate indices, malformed values and absent content", () => {
  for (const raw of [null, [], [null], [output(), output()], [{ ...output(), input: { txHash: "cd".repeat(32), outputIndex: 0 } }], [{ ...output(), input: { txHash: HASH, outputIndex: -1 } }], [{ ...output(), output: { ...output().output, scriptRef: 0 } }], [{ ...output(), output: { ...output().output, amount: [{ unit: "lovelace", quantity: "1.5" }] } }]]) assert.equal(immutableOutputs(raw, HASH, 0), undefined);
  assert.equal(immutableOutputs([output()], HASH, 1), undefined);
});
