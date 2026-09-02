import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPresignCostRows } from "./presign-costs";

test("a fee alone renders one estimated row", () => {
  const rows = buildPresignCostRows({ estimatedFeeLovelace: "182397" });

  assert.deepEqual(rows, [
    { id: "fee", lovelace: "182397", precision: "estimated" }
  ]);
});

test("balance and fee produce an exact balance row and an estimated remainder", () => {
  const rows = buildPresignCostRows({
    estimatedFeeLovelace: "182397",
    walletBalanceLovelace: "10000000"
  });

  assert.deepEqual(rows, [
    { id: "fee", lovelace: "182397", precision: "estimated" },
    { id: "balance", lovelace: "10000000", precision: "exact" },
    // 10 ADA minus the fee, computed in lovelace, not floats.
    { id: "balanceAfterFee", lovelace: "9817603", precision: "estimated" }
  ]);
});

test("a balance without a fee shows the balance but no remainder", () => {
  const rows = buildPresignCostRows({ walletBalanceLovelace: "10000000" });

  assert.deepEqual(rows, [
    { id: "balance", lovelace: "10000000", precision: "exact" }
  ]);
});

test("no data at all renders no rows, so nothing is invented", () => {
  assert.deepEqual(buildPresignCostRows({}), []);
  assert.deepEqual(buildPresignCostRows({ estimatedFeeLovelace: null, walletBalanceLovelace: null }), []);
});

test("malformed amounts mean missing, not zero", () => {
  for (const bad of ["", "  ", "12.5", "-5", "abc", "1e6"]) {
    const rows = buildPresignCostRows({ estimatedFeeLovelace: bad, walletBalanceLovelace: bad });
    assert.deepEqual(rows, [], `expected no rows for ${JSON.stringify(bad)}`);
  }
});

test("surrounding whitespace does not disqualify an amount", () => {
  const rows = buildPresignCostRows({ estimatedFeeLovelace: "  182397  " });

  assert.deepEqual(rows, [
    { id: "fee", lovelace: "182397", precision: "estimated" }
  ]);
});

test("a balance equal to the fee leaves an explicit zero remainder", () => {
  const rows = buildPresignCostRows({
    estimatedFeeLovelace: "1000000",
    walletBalanceLovelace: "1000000"
  });

  assert.deepEqual(
    rows.filter((row) => row.id === "balanceAfterFee"),
    [{ id: "balanceAfterFee", lovelace: "0", precision: "estimated" }]
  );
});

test("a fee larger than the balance shows both amounts but no negative remainder", () => {
  const rows = buildPresignCostRows({
    estimatedFeeLovelace: "200000",
    walletBalanceLovelace: "182397"
  });

  assert.deepEqual(
    rows.map((row) => row.id),
    ["fee", "balance"]
  );
});

test("minimum-UTxO, deposit and refund rows appear only when a caller supplies them", () => {
  const rows = buildPresignCostRows({
    minimumUtxoLovelace: "978070",
    depositLovelace: "2000000",
    refundLovelace: "2000000"
  });

  assert.deepEqual(rows, [
    { id: "minimumUtxo", lovelace: "978070", precision: "exact" },
    { id: "deposit", lovelace: "2000000", precision: "exact" },
    { id: "refund", lovelace: "2000000", precision: "exact" }
  ]);
});
