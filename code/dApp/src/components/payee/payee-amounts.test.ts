import assert from "node:assert/strict";
import test from "node:test";
import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";
import { computePayeeDueAmount } from "@/components/payee/payee-amounts";
import { computeStreamingPaymentDueAmount } from "@/lib/user-flow/guided-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = 1_760_000_000_000;

function payment(overrides: Partial<PayeeStreamingPayment> = {}): PayeeStreamingPayment {
  return {
    streamingPaymentId: 3,
    policyId: "",
    assetName: "",
    amountPerDay: 5_000_000,
    startDate: START,
    endDate: START + 30 * DAY_MS,
    paidOutAmount: 0,
    payerWalletName: "Household wallet",
    lastNonAdminPayoutAt: null,
    sttInputTxHash: "ab".repeat(32),
    sttInputOutputIndex: 0,
    sttPolicyId: "cd".repeat(28),
    sttAssetNameHex: "ef",
    ...overrides
  };
}

/**
 * The payer's workspace was the only caller of `computeStreamingPaymentDueAmount`. These tests
 * hold the payee's page to the same function, because the two sides disagreeing about what is
 * owed is worse than neither side showing it.
 */

test("ten days into a 5 ADA/day stream, 50 ADA is owed", () => {
  const due = computePayeeDueAmount(payment(), START + 10 * DAY_MS);
  assert.equal(due, String(50_000_000));
});

test("what has already been paid out is subtracted", () => {
  const due = computePayeeDueAmount(
    payment({ paidOutAmount: 20_000_000 }),
    START + 10 * DAY_MS
  );
  assert.equal(due, String(30_000_000));
});

test("earning stops at the end date rather than running on", () => {
  const atEnd = computePayeeDueAmount(payment(), START + 30 * DAY_MS);
  const longAfter = computePayeeDueAmount(payment(), START + 900 * DAY_MS);
  assert.equal(atEnd, String(150_000_000));
  assert.equal(longAfter, atEnd);
});

test("nothing is owed before the stream starts", () => {
  assert.equal(computePayeeDueAmount(payment(), START - DAY_MS), "0");
});

test("an overpaid stream reports zero, never a negative", () => {
  const due = computePayeeDueAmount(
    payment({ paidOutAmount: 999_000_000 }),
    START + 10 * DAY_MS
  );
  assert.equal(due, "0");
});

test("the payee sees exactly what the payer's own calculation produces", () => {
  const p = payment({ paidOutAmount: 7_000_000 });
  const nowMs = START + 12 * DAY_MS;

  assert.equal(
    computePayeeDueAmount(p, nowMs),
    computeStreamingPaymentDueAmount(
      {
        id: String(p.streamingPaymentId),
        payoutAddress: "",
        paidOutAmount: String(p.paidOutAmount),
        policyId: p.policyId,
        assetName: p.assetName,
        amountPerDay: String(p.amountPerDay),
        startDate: String(p.startDate),
        endDate: String(p.endDate)
      },
      nowMs
    )
  );
});
