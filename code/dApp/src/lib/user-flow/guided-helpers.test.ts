import assert from "node:assert/strict";
import { test } from "node:test";
import type { UTxO } from "@meshsdk/core";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { Asset } from "@/lib/types/contracts";
import {
  computeStreamingPaymentDueAmount,
  parseAdaToLovelace,
  suggestWalletInputsForRequestedAssets
} from "@/lib/user-flow/guided-helpers";

const DAY_MS = 86_400_000;

function streamingPayment(over: Partial<StreamingPaymentFormState>): StreamingPaymentFormState {
  return {
    id: "1",
    payoutAddress: "addr_test1xyz",
    paidOutAmount: "0",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: "0",
    endDate: String(10 * DAY_MS),
    ...over
  };
}

function utxo(txHash: string, amount: Asset[]): UTxO {
  return {
    input: { txHash, outputIndex: 0 },
    output: { address: "addr_test1wallet", amount }
  };
}

test("parseAdaToLovelace converts whole, fractional, and comma-grouped ADA", () => {
  assert.equal(parseAdaToLovelace("1"), "1000000");
  assert.equal(parseAdaToLovelace("1.5"), "1500000");
  assert.equal(parseAdaToLovelace("0.000001"), "1"); // one lovelace
  assert.equal(parseAdaToLovelace("1,000"), "1000000000");
  assert.equal(parseAdaToLovelace("  2  "), "2000000"); // trimmed
});

test("parseAdaToLovelace rejects junk and over-precise input", () => {
  assert.equal(parseAdaToLovelace("1.1234567"), null); // > 6 decimals
  assert.equal(parseAdaToLovelace("abc"), null);
  assert.equal(parseAdaToLovelace(""), null);
  assert.equal(parseAdaToLovelace(".5"), null);
});

test("computeStreamingPaymentDueAmount accrues linearly and caps at the end date", () => {
  const sp = streamingPayment({ amountPerDay: "1000000", startDate: "0", endDate: String(10 * DAY_MS) });

  // Halfway through: 5 of 10 days at 1 ADA/day.
  assert.equal(computeStreamingPaymentDueAmount(sp, 5 * DAY_MS), "5000000");
  // At the end: full 10 ADA.
  assert.equal(computeStreamingPaymentDueAmount(sp, 10 * DAY_MS), "10000000");
  // Past the end: still capped at the end date, not unbounded.
  assert.equal(computeStreamingPaymentDueAmount(sp, 999 * DAY_MS), "10000000");
});

test("computeStreamingPaymentDueAmount returns 0 before start and when fully paid", () => {
  const future = streamingPayment({ startDate: String(100 * DAY_MS), endDate: String(200 * DAY_MS) });
  assert.equal(computeStreamingPaymentDueAmount(future, 50 * DAY_MS), "0");

  const paid = streamingPayment({ endDate: String(10 * DAY_MS), paidOutAmount: "10000000" });
  assert.equal(computeStreamingPaymentDueAmount(paid, 10 * DAY_MS), "0");
});

test("suggestWalletInputsForRequestedAssets selects a single covering UTxO", () => {
  const utxos = [utxo("aa", [{ unit: "lovelace", quantity: "5000000" }])];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "5000000" }
  ]);
  assert.deepEqual(selected, [{ txHash: "aa", outputIndex: 0 }]);
});

test("suggestWalletInputsForRequestedAssets combines multiple UTxOs to cover the request", () => {
  const utxos = [
    utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]),
    utxo("bb", [{ unit: "lovelace", quantity: "5000000" }])
  ];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "8000000" }
  ]);
  assert.equal(selected.length, 2);
});

test("suggestWalletInputsForRequestedAssets returns [] when the request cannot be funded", () => {
  const utxos = [utxo("aa", [{ unit: "lovelace", quantity: "5000000" }])];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "10000000" }
  ]);
  assert.deepEqual(selected, []);
});

test("suggestWalletInputsForRequestedAssets covers lovelace and a native asset together", () => {
  const utxos = [
    utxo("aa", [
      { unit: "lovelace", quantity: "3000000" },
      { unit: "policytoken", quantity: "10" }
    ])
  ];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "2000000" },
    { unit: "policytoken", quantity: "5" }
  ]);
  assert.deepEqual(selected, [{ txHash: "aa", outputIndex: 0 }]);
});
