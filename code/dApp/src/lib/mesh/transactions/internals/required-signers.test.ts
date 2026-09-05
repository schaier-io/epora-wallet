import assert from "node:assert/strict";
import test from "node:test";
import {
  addExtraRequiredSigners,
  resolveExtraRequiredSignerKeyHashes
} from "@/lib/mesh/transactions/internals/required-signers";

const OWN = "aa".repeat(28);
const OTHER = "bb".repeat(28);

function distinctKeyHashes(count: number) {
  return Array.from({ length: count }, (_, index) =>
    index.toString(16).padStart(56, "0")
  );
}

test("lists each co-signer once, lower-cased, and never the builder's own key", () => {
  assert.deepEqual(
    resolveExtraRequiredSignerKeyHashes(OWN, [OTHER.toUpperCase(), OWN, ` ${OTHER} `]),
    [OTHER]
  );
});

test("an absent or empty list adds nobody", () => {
  assert.deepEqual(resolveExtraRequiredSignerKeyHashes(OWN, undefined), []);
  assert.deepEqual(resolveExtraRequiredSignerKeyHashes(OWN, []), []);
});

test("rejects a value that is not a payment key hash", () => {
  assert.throws(
    () => resolveExtraRequiredSignerKeyHashes(OWN, ["addr_test1qq"]),
    /not a payment key hash/
  );
});

test("lets the ledger transaction-size limit bound the signer set", () => {
  assert.equal(
    resolveExtraRequiredSignerKeyHashes(OWN, distinctKeyHashes(15)).length,
    15
  );
});

test("adds each extra co-signer to a transaction body", () => {
  const added: string[] = [];
  const tx = {
    txBuilder: {
      requiredSignerHash: (keyHash: string) => added.push(keyHash)
    }
  };
  const changeAddress = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";

  assert.deepEqual(addExtraRequiredSigners(tx, changeAddress, [OTHER]), [OTHER]);
  assert.deepEqual(added, [OTHER]);
});
