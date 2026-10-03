import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReferenceUtxoConfig } from "./reference-utxo-config";

const HASH = "ab".repeat(32);

test("parseReferenceUtxoConfig parses both separators and rejects bad formats", () => {
  assert.equal(parseReferenceUtxoConfig(undefined, "Ref"), null);
  assert.equal(parseReferenceUtxoConfig("   ", "Ref"), null);
  assert.deepEqual(parseReferenceUtxoConfig(`${HASH}#3`, "Ref"), { txHash: HASH, outputIndex: 3 });
  assert.deepEqual(parseReferenceUtxoConfig(`${HASH.toUpperCase()}:7`, "Ref"), {
    txHash: HASH,
    outputIndex: 7
  });
  assert.throws(() => parseReferenceUtxoConfig("not-a-ref", "Ref"), /must use the format txHash#index/);
});
