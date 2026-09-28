import assert from "node:assert/strict";
import test from "node:test";
import { dropZeroQuantityAssets, positiveOutputAmount } from "@/lib/mesh/transactions/internals";

/**
 * The lock-funds editor seeds every new row at "0". A row left there reached
 * Mesh's `toValue` verbatim, and the ledger rejects outputs holding
 * zero-quantity assets, after the user had signed.
 */
test("zero rows are dropped, positive rows and order survive", () => {
  const assets = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: "ab".repeat(28) + "544f4b454e", quantity: "0" },
    { unit: "cd".repeat(28) + "f001", quantity: "7" },
    { unit: "ef".repeat(28) + "0002", quantity: "00" }
  ];

  assert.deepEqual(dropZeroQuantityAssets(assets), [
    { unit: "lovelace", quantity: "5000000" },
    { unit: "cd".repeat(28) + "f001", quantity: "7" }
  ]);
});

test("an all-zero list empties instead of fabricating a value", () => {
  assert.deepEqual(
    dropZeroQuantityAssets([{ unit: "lovelace", quantity: "0" }]),
    []
  );
});

test("a malformed quantity is kept for the guards to refuse", () => {
  const assets = [{ unit: "lovelace", quantity: "abc" }, { unit: "lovelace", quantity: " 0 " }];
  assert.deepEqual(dropZeroQuantityAssets(assets), [{ unit: "lovelace", quantity: "abc" }]);
});

test("an output amount that was all zero is refused, not topped up to min ADA", () => {
  assert.throws(
    () => positiveOutputAmount([{ unit: "lovelace", quantity: "0" }], "Transfer to addr_test1x"),
    /Transfer to addr_test1x: every asset row is zero/
  );
});

test("an output amount keeps its positive rows, and an empty list stays allowed", () => {
  assert.deepEqual(
    positiveOutputAmount([{ unit: "lovelace", quantity: "2000000" }, { unit: "ab".repeat(29), quantity: "0" }], "x"),
    [{ unit: "lovelace", quantity: "2000000" }]
  );
  assert.deepEqual(positiveOutputAmount([], "x"), []);
});
