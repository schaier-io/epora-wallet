import assert from "node:assert/strict";
import test from "node:test";
import {
  addExtraRequiredSigners,
  resolveExtraRequiredSignerKeyHashes
} from "@/lib/mesh/transactions/internals/required-signers";
import { MAX_EXTRA_REQUIRED_SIGNER_KEY_HASHES } from "@/lib/contracts/transaction-limits";

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

test("reserves one on-chain signatory slot for the connected wallet", () => {
  assert.equal(
    resolveExtraRequiredSignerKeyHashes(
      OWN,
      distinctKeyHashes(MAX_EXTRA_REQUIRED_SIGNER_KEY_HASHES)
    ).length,
    MAX_EXTRA_REQUIRED_SIGNER_KEY_HASHES
  );
  assert.throws(
    () =>
      resolveExtraRequiredSignerKeyHashes(
        OWN,
        distinctKeyHashes(MAX_EXTRA_REQUIRED_SIGNER_KEY_HASHES + 1)
      ),
    /connected wallet uses one on-chain signatory slot/
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
