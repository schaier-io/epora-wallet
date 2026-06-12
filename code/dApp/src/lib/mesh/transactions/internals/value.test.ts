import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveAssetName,
  getLovelaceQuantity,
  mergeAssetLists,
  mergeAssetsByUnit,
  normalizeMintStarterAssets,
  setLovelaceQuantity,
  subtractSelectedInputRemainder,
  summarizeAmountForTxPreview
} from "@/lib/mesh/transactions/internals/value";

const NATIVE = `${"aa".repeat(28)}01`;
const NATIVE_B = `${"bb".repeat(28)}02`;

test("setLovelaceQuantity rewrites an existing lovelace entry in place", () => {
  const amount = [
    { unit: "lovelace", quantity: "1" },
    { unit: NATIVE, quantity: "5" }
  ];
  setLovelaceQuantity(amount, 42n);
  assert.deepEqual(amount, [
    { unit: "lovelace", quantity: "42" },
    { unit: NATIVE, quantity: "5" }
  ]);
});

test("setLovelaceQuantity treats the empty unit as lovelace and normalizes it", () => {
  const amount = [{ unit: "", quantity: "3" }];
  setLovelaceQuantity(amount, 7n);
  assert.deepEqual(amount, [{ unit: "lovelace", quantity: "7" }]);
});

test("setLovelaceQuantity appends lovelace when absent", () => {
  const amount = [{ unit: NATIVE, quantity: "5" }];
  setLovelaceQuantity(amount, 9n);
  assert.deepEqual(amount, [
    { unit: NATIVE, quantity: "5" },
    { unit: "lovelace", quantity: "9" }
  ]);
});

test("getLovelaceQuantity reads lovelace, the empty unit, and defaults to zero", () => {
  assert.equal(getLovelaceQuantity([{ unit: "lovelace", quantity: "12" }]), 12n);
  assert.equal(getLovelaceQuantity([{ unit: "", quantity: "8" }]), 8n);
  assert.equal(getLovelaceQuantity([{ unit: NATIVE, quantity: "5" }]), 0n);
});

test("mergeAssetLists sums by unit, drops zero-net entries, and sorts lovelace first", () => {
  assert.deepEqual(
    mergeAssetLists([
      [
        { unit: NATIVE, quantity: "3" },
        { unit: "lovelace", quantity: "10" }
      ],
      [
        { unit: NATIVE, quantity: "4" },
        { unit: NATIVE_B, quantity: "1" }
      ]
    ]),
    [
      { unit: "lovelace", quantity: "10" },
      { unit: NATIVE, quantity: "7" },
      { unit: NATIVE_B, quantity: "1" }
    ]
  );
});

test("mergeAssetLists cancels out a fully-spent asset", () => {
  assert.deepEqual(
    mergeAssetLists([
      [{ unit: NATIVE, quantity: "5" }],
      [{ unit: NATIVE, quantity: "-5" }]
    ]),
    []
  );
});

test("subtractSelectedInputRemainder returns only positive remainders", () => {
  assert.deepEqual(
    subtractSelectedInputRemainder(
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

test("mergeAssetsByUnit lets preferred override fallback and drops zero quantities", () => {
  assert.deepEqual(
    mergeAssetsByUnit(
      [
        { unit: "lovelace", quantity: "50" },
        { unit: NATIVE, quantity: "0" } // zero preferred -> dropped
      ],
      [
        { unit: "lovelace", quantity: "999" }, // overridden by preferred
        { unit: NATIVE_B, quantity: "3" }
      ]
    ),
    [
      { unit: "lovelace", quantity: "50" },
      { unit: NATIVE_B, quantity: "3" }
    ]
  );
});

test("normalizeMintStarterAssets falls back to the provided lovelace when no assets are given", () => {
  assert.deepEqual(normalizeMintStarterAssets([], "2000000"), [
    { unit: "lovelace", quantity: "2000000" }
  ]);
  assert.deepEqual(normalizeMintStarterAssets(undefined, "2000000"), [
    { unit: "lovelace", quantity: "2000000" }
  ]);
});

test("normalizeMintStarterAssets pins lovelace to zero when only native assets are supplied", () => {
  assert.deepEqual(
    normalizeMintStarterAssets([{ unit: NATIVE, quantity: "5" }], "2000000"),
    [
      { unit: "lovelace", quantity: "0" },
      { unit: NATIVE, quantity: "5" }
    ]
  );
});

test("normalizeMintStarterAssets sums duplicate units", () => {
  assert.deepEqual(
    normalizeMintStarterAssets(
      [
        { unit: "lovelace", quantity: "1" },
        { unit: "lovelace", quantity: "2" }
      ],
      "2000000"
    ),
    [{ unit: "lovelace", quantity: "3" }]
  );
});

test("normalizeMintStarterAssets rejects malformed amounts", () => {
  assert.throws(() => normalizeMintStarterAssets([], "abc"), /non-negative integer/);
  assert.throws(
    () => normalizeMintStarterAssets([{ unit: "lovelace", quantity: "1.5" }], "2000000"),
    /whole-number amount/
  );
  assert.throws(
    () => normalizeMintStarterAssets([{ unit: NATIVE, quantity: "" }], "2000000"),
    /must include an asset and amount/
  );
});

test("summarizeAmountForTxPreview describes lovelace and native asset counts", () => {
  assert.equal(summarizeAmountForTxPreview([{ unit: "lovelace", quantity: "5" }]), "5 lovelace");
  assert.equal(
    summarizeAmountForTxPreview([
      { unit: "lovelace", quantity: "5" },
      { unit: NATIVE, quantity: "1" }
    ]),
    "5 lovelace and 1 native asset"
  );
  assert.equal(
    summarizeAmountForTxPreview([
      { unit: "lovelace", quantity: "5" },
      { unit: NATIVE, quantity: "1" },
      { unit: NATIVE_B, quantity: "2" }
    ]),
    "5 lovelace and 2 native assets"
  );
});

test("deriveAssetName is deterministic, 32 bytes, and sensitive to the output index", () => {
  const name = deriveAssetName({ txHash: "ab".repeat(32), outputIndex: 0 });
  assert.equal(name.length, 64);
  assert.equal(name, "264ef6a6af43621dc108a5634311a8dd808d3e7d544674ab23a98e5245fddab3");
  assert.notEqual(name, deriveAssetName({ txHash: "ab".repeat(32), outputIndex: 1 }));
});
