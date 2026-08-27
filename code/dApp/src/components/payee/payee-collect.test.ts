import assert from "node:assert/strict";
import test from "node:test";
import type { UTxO } from "@meshsdk/core";

import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";
import { planPayeeCollect } from "@/components/payee/payee-collect";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = 1_760_000_000_000;
const PAYEE = "addr_test1payee";

function payment(overrides: Partial<PayeeStreamingPayment> = {}): PayeeStreamingPayment {
  return {
    streamingPaymentId: 3,
    policyId: "",
    assetName: "",
    amountPerDay: 5_000_000,
    startDate: START,
    endDate: START + 30 * DAY_MS,
    paidOutAmount: 0,
    payerWalletName: "Acme Studio payroll",
    payoutAddress: PAYEE,
    lastNonAdminPayoutAt: null,
    sttInputTxHash: "ab".repeat(32),
    sttInputOutputIndex: 2,
    sttPolicyId: "cd".repeat(28),
    sttAssetNameHex: "ef",
    ...overrides
  };
}

function utxo(quantity: string, txHash: string, unit = "lovelace"): UTxO {
  return {
    input: { txHash, outputIndex: 0 },
    output: { address: "addr_test1wallet", amount: [{ unit, quantity }] }
  } as unknown as UTxO;
}

function window(nowMs: number) {
  return { earliestTimeMs: nowMs, latestTimeMs: nowMs + 6 * 60 * 1000 };
}

/**
 * The contract lets a stream's payee sign their own payout; the page offered them only a
 * destructive `Shorten payment`. These tests pin when collecting is possible and, when it is
 * not, that the refusal says which of the several reasons applies.
 */

test("a payee with earnings and a funded wallet can collect", () => {
  const plan = planPayeeCollect(
    payment(),
    [utxo("500000000", "11".repeat(32))],
    window(START + 10 * DAY_MS)
  );

  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.equal(plan.quantity, String(50_000_000));
  assert.equal(plan.unit, "lovelace");
  assert.equal(plan.transfers.length, 1);
  assert.equal(plan.transfers[0]?.address, PAYEE);
  assert.deepEqual(plan.transfers[0]?.amount, [
    { unit: "lovelace", quantity: String(50_000_000) }
  ]);
});

test("the payout output is tagged with the STT input it was authorised by", () => {
  const plan = planPayeeCollect(
    payment(),
    [utxo("500000000", "11".repeat(32))],
    window(START + 10 * DAY_MS)
  );

  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.deepEqual(plan.transfers[0]?.inlineDatum, {
    alternative: 0,
    fields: [3, "ab".repeat(32), 2]
  });
});

test("every locked pool is selected, because the wallet must keep its reserve in the change", () => {
  const plan = planPayeeCollect(
    payment(),
    [utxo("60000000", "11".repeat(32)), utxo("400000000", "22".repeat(32))],
    window(START + 10 * DAY_MS)
  );

  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.deepEqual(
    plan.walletInputs.map((ref) => ref.txHash).sort(),
    ["11".repeat(32), "22".repeat(32)]
  );
});

test("the shared cooldown is named as the reason, not reported as an absence of money", () => {
  const nowMs = START + 10 * DAY_MS;
  const plan = planPayeeCollect(
    payment({ lastNonAdminPayoutAt: nowMs - 60_000 }),
    [utxo("500000000", "11".repeat(32))],
    window(nowMs)
  );

  assert.equal(plan.status, "blocked");
  if (plan.status !== "blocked") return;
  assert.match(plan.reason, /30-minute cooldown/);
});

test("nothing owed yet is a distinct refusal from a wallet that cannot pay", () => {
  const plan = planPayeeCollect(
    payment(),
    [utxo("500000000", "11".repeat(32))],
    window(START - DAY_MS)
  );

  assert.equal(plan.status, "blocked");
  if (plan.status !== "blocked") return;
  assert.match(plan.reason, /Nothing is owed to you yet/);
});

test("a short wallet says how short it is, in the unit of the row above", () => {
  const plan = planPayeeCollect(
    payment(),
    [utxo("12000000", "11".repeat(32))],
    window(START + 10 * DAY_MS)
  );

  assert.equal(plan.status, "blocked");
  if (plan.status !== "blocked") return;
  assert.match(plan.reason, /holds 12 ADA of the 50 ADA owed to you/);
});

test("a wallet with no locked funds at all is refused before a transaction is built", () => {
  const plan = planPayeeCollect(payment(), [], window(START + 10 * DAY_MS));

  assert.equal(plan.status, "blocked");
  if (plan.status !== "blocked") return;
  assert.match(plan.reason, /holds 0 ADA of the 50 ADA owed/);
});

test("an unreadable payout address refuses rather than paying the wrong place", () => {
  const plan = planPayeeCollect(
    payment({ payoutAddress: "" }),
    [utxo("500000000", "11".repeat(32))],
    window(START + 10 * DAY_MS)
  );

  assert.equal(plan.status, "blocked");
  if (plan.status !== "blocked") return;
  assert.match(plan.reason, /payout address on this payment could not be read/);
});

test("a token stream is measured in its own asset, not in ADA", () => {
  const unit = `${"aa".repeat(28)}beef`;
  const plan = planPayeeCollect(
    payment({ policyId: "aa".repeat(28), assetName: "beef", amountPerDay: 10 }),
    [utxo("5", "11".repeat(32), unit)],
    window(START + 10 * DAY_MS)
  );

  assert.equal(plan.status, "blocked");
  if (plan.status !== "blocked") return;
  assert.match(plan.reason, /holds 5 beef of the 100 beef owed/);
});
