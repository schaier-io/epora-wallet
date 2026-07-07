import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAssetDelta,
  cloneAssets,
  collectAddressAssets,
  collectUtxoAssets,
  compareAssetAmounts,
  countAddressUtxos,
  countAssetUtxos,
  getAssetQuantityByUnit,
  mergeAmountLists,
  subtractAmountLists,
  utxoContainsAsset
} from "./asset-amounts";
import { type Asset } from "@/lib/types/contracts";
import { type UTxO } from "@meshsdk/core";

const NATIVE = `${"aa".repeat(28)}01`;
const NATIVE_B = `${"bb".repeat(28)}02`;

function utxo(
  txHash: string,
  outputIndex: number,
  address: string,
  amount: Asset[]
): UTxO {
  return {
    input: { txHash, outputIndex },
    output: { address, amount }
  };
}

test("cloneAssets returns a shallow copy that does not alias the originals", () => {
  const original: Asset[] = [{ unit: "lovelace", quantity: "5" }];
  const copy = cloneAssets(original);
  copy[0]!.quantity = "9";
  assert.equal(original[0]!.quantity, "5");
  assert.notEqual(copy[0], original[0]);
});

test("getAssetQuantityByUnit finds a unit and defaults to '0' when absent", () => {
  const assets: Asset[] = [
    { unit: "lovelace", quantity: "12" },
    { unit: NATIVE, quantity: "3" }
  ];
  assert.equal(getAssetQuantityByUnit(assets, NATIVE), "3");
  assert.equal(getAssetQuantityByUnit(assets, NATIVE_B), "0");
  assert.equal(getAssetQuantityByUnit([], "lovelace"), "0");
});

test("mergeAmountLists sums quantities per unit across lists", () => {
  assert.deepEqual(
    mergeAmountLists([
      [
        { unit: "lovelace", quantity: "10" },
        { unit: NATIVE, quantity: "3" }
      ],
      [
        { unit: "lovelace", quantity: "5" },
        { unit: NATIVE_B, quantity: "1" }
      ]
    ]),
    [
      { unit: "lovelace", quantity: "15" },
      { unit: NATIVE, quantity: "3" },
      { unit: NATIVE_B, quantity: "1" }
    ]
  );
});

test("mergeAmountLists keeps zero-net entries (no pruning) and handles empties", () => {
  assert.deepEqual(
    mergeAmountLists([
      [{ unit: NATIVE, quantity: "5" }],
      [{ unit: NATIVE, quantity: "-5" }]
    ]),
    [{ unit: NATIVE, quantity: "0" }]
  );
  assert.deepEqual(mergeAmountLists([]), []);
  assert.deepEqual(mergeAmountLists([[]]), []);
});

test("subtractAmountLists removes fully or over-consumed units and keeps positive remainders", () => {
  assert.deepEqual(
    subtractAmountLists(
      [
        { unit: "lovelace", quantity: "100" },
        { unit: NATIVE, quantity: "5" },
        { unit: NATIVE_B, quantity: "2" }
      ],
      [
        { unit: "lovelace", quantity: "30" },
        { unit: NATIVE, quantity: "5" }, // exactly consumed -> dropped
        { unit: NATIVE_B, quantity: "9" } // over-consumed -> dropped
      ]
    ),
    [{ unit: "lovelace", quantity: "70" }]
  );
});

test("subtractAmountLists aggregates duplicate allocated units before subtracting", () => {
  assert.deepEqual(
    subtractAmountLists(
      [{ unit: "lovelace", quantity: "100" }],
      [
        { unit: "lovelace", quantity: "40" },
        { unit: "lovelace", quantity: "35" }
      ]
    ),
    [{ unit: "lovelace", quantity: "25" }]
  );
});

test("collectAddressAssets merges only utxos at the target address and skips malformed ones", () => {
  const utxos = [
    utxo("aa".repeat(32), 0, "addrA", [
      { unit: "lovelace", quantity: "10" },
      { unit: NATIVE, quantity: "2" }
    ]),
    utxo("bb".repeat(32), 0, "addrA", [{ unit: "lovelace", quantity: "5" }]),
    utxo("cc".repeat(32), 0, "addrB", [{ unit: "lovelace", quantity: "99" }]),
    null,
    undefined,
    { output: { address: "addrA" } } // missing amount array -> skipped
  ];
  assert.deepEqual(collectAddressAssets(utxos, "addrA"), [
    { unit: "lovelace", quantity: "15" },
    { unit: NATIVE, quantity: "2" }
  ]);
});

test("collectUtxoAssets merges all utxo amounts and filters non-asset entries", () => {
  const utxos = [
    utxo("aa".repeat(32), 0, "addrA", [
      { unit: "lovelace", quantity: "10" },
      { unit: NATIVE, quantity: "1" }
    ]),
    utxo("bb".repeat(32), 1, "addrB", [{ unit: NATIVE, quantity: "4" }])
  ];
  assert.deepEqual(collectUtxoAssets(utxos), [
    { unit: "lovelace", quantity: "10" },
    { unit: NATIVE, quantity: "5" }
  ]);
});

test("countAddressUtxos counts only entries at the address and ignores nullish", () => {
  const utxos = [
    { output: { address: "addrA" } },
    { output: { address: "addrA" } },
    { output: { address: "addrB" } },
    null,
    undefined
  ];
  assert.equal(countAddressUtxos(utxos, "addrA"), 2);
  assert.equal(countAddressUtxos(utxos, "addrZ"), 0);
});

test("utxoContainsAsset detects a unit and tolerates missing structure", () => {
  assert.equal(
    utxoContainsAsset({ output: { amount: [{ unit: NATIVE, quantity: "1" }] } }, NATIVE),
    true
  );
  assert.equal(
    utxoContainsAsset({ output: { amount: [{ unit: NATIVE, quantity: "1" }] } }, NATIVE_B),
    false
  );
  assert.equal(utxoContainsAsset(null, NATIVE), false);
  assert.equal(utxoContainsAsset({ output: {} }, NATIVE), false);
});

test("countAssetUtxos counts utxos holding the given unit", () => {
  const utxos = [
    { output: { amount: [{ unit: NATIVE, quantity: "1" }] } },
    { output: { amount: [{ unit: NATIVE, quantity: "2" }, { unit: "lovelace", quantity: "5" }] } },
    { output: { amount: [{ unit: "lovelace", quantity: "5" }] } },
    null
  ];
  assert.equal(countAssetUtxos(utxos, NATIVE), 2);
  assert.equal(countAssetUtxos(utxos, "lovelace"), 2);
  assert.equal(countAssetUtxos(utxos, NATIVE_B), 0);
});

test("compareAssetAmounts classifies increase, decrease, mixed, and equal", () => {
  assert.equal(
    compareAssetAmounts(
      [{ unit: "lovelace", quantity: "10" }],
      [{ unit: "lovelace", quantity: "15" }]
    ),
    "increase"
  );
  assert.equal(
    compareAssetAmounts(
      [{ unit: "lovelace", quantity: "10" }],
      [{ unit: "lovelace", quantity: "4" }]
    ),
    "decrease"
  );
  assert.equal(
    compareAssetAmounts(
      [
        { unit: "lovelace", quantity: "10" },
        { unit: NATIVE, quantity: "5" }
      ],
      [
        { unit: "lovelace", quantity: "15" },
        { unit: NATIVE, quantity: "2" }
      ]
    ),
    "mixed"
  );
  assert.equal(
    compareAssetAmounts(
      [{ unit: "lovelace", quantity: "10" }],
      [{ unit: "lovelace", quantity: "10" }]
    ),
    "equal"
  );
});

test("compareAssetAmounts treats an appearing/disappearing unit against implicit zero", () => {
  // native asset present only in `after` -> increase from 0
  assert.equal(
    compareAssetAmounts([], [{ unit: NATIVE, quantity: "1" }]),
    "increase"
  );
  // native asset present only in `before` -> decrease to 0
  assert.equal(
    compareAssetAmounts([{ unit: NATIVE, quantity: "1" }], []),
    "decrease"
  );
  assert.equal(compareAssetAmounts([], []), "equal");
});

test("calculateAssetDelta returns signed non-zero deltas, lovelace first then sorted", () => {
  assert.deepEqual(
    calculateAssetDelta(
      [
        { unit: "lovelace", quantity: "10" },
        { unit: NATIVE, quantity: "5" },
        { unit: NATIVE_B, quantity: "3" }
      ],
      [
        { unit: "lovelace", quantity: "4" },
        { unit: NATIVE, quantity: "5" }, // unchanged -> filtered out
        { unit: NATIVE_B, quantity: "8" }
      ]
    ),
    [
      { unit: "lovelace", quantity: "-6" },
      { unit: NATIVE_B, quantity: "5" }
    ]
  );
});

test("calculateAssetDelta is empty when nothing changed", () => {
  assert.deepEqual(
    calculateAssetDelta(
      [{ unit: "lovelace", quantity: "10" }],
      [{ unit: "lovelace", quantity: "10" }]
    ),
    []
  );
});
