import assert from "node:assert/strict";
import test from "node:test";

import { computeStreamingPaymentDueAmount } from "@/lib/user-flow/streaming-payment-helpers";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import {
  deriveStreamingExpenseProjection,
  deriveStreamingExpenseProjections
} from "./streaming-expense-projection";

const DAY_MS = 86_400_000;
const START = 1_755_000_000_000;
const END = START + 10 * DAY_MS;
const NOW = START + 3 * DAY_MS;

// 1 ADA per day for 10 days: a 10 ADA lifetime cap, so every whole day of
// accrual is exactly 1_000_000 lovelace.
function stream(overrides: Partial<StreamingPaymentFormState> = {}): StreamingPaymentFormState {
  return {
    id: "7",
    payoutAddress: "addr_test1payee",
    paidOutAmount: "0",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: String(START),
    endDate: String(END),
    ...overrides
  };
}

test("zero elapsed: at its start date nothing has accrued", () => {
  const projection = deriveStreamingExpenseProjection(stream(), START);
  assert.equal(projection.accruedToDate, "0");
  assert.equal(projection.unpaidAccrued, "0");
  assert.equal(projection.projectedRemaining, "10000000");
  assert.equal(projection.status.kind, "active");
});

test("a stream that has not started accrues nothing and owes nothing yet", () => {
  const projection = deriveStreamingExpenseProjection(stream(), START - 1);
  assert.equal(projection.accruedToDate, "0");
  assert.equal(projection.unpaidAccrued, "0");
  assert.equal(projection.projectedRemaining, "10000000");
  assert.equal(projection.status.kind, "upcoming");
});

test("a partial period floors to whole days of accrual", () => {
  // 3 lovelace/day over 1.5 days is 4.5 lovelace; the schedule has only
  // accrued 4: the projection must not promise the half.
  const projection = deriveStreamingExpenseProjection(
    stream({ amountPerDay: "3" }),
    START + 1.5 * DAY_MS
  );
  assert.equal(projection.accruedToDate, "4");
  assert.equal(projection.unpaidAccrued, "4");
});

test("multiple periods accrue one rate per full day", () => {
  const projection = deriveStreamingExpenseProjection(stream(), NOW);
  assert.equal(projection.accruedToDate, "3000000");
  assert.equal(projection.unpaidAccrued, "3000000");
});

test("the end-date boundary accrues the full lifetime cap", () => {
  const projection = deriveStreamingExpenseProjection(stream(), END);
  assert.equal(projection.accruedToDate, "10000000");
  assert.equal(projection.lifetimeTotal, "10000000");
  assert.equal(projection.projectedRemaining, "0");
  assert.equal(projection.status.kind, "ended");
});

test("past the end date accrual stops at the cap", () => {
  const projection = deriveStreamingExpenseProjection(stream(), END + 50 * DAY_MS);
  assert.equal(projection.accruedToDate, "10000000");
  assert.equal(projection.projectedRemaining, "0");
});

test("settled payouts reconcile: unpaid is accrued minus paid", () => {
  const projection = deriveStreamingExpenseProjection(
    stream({ paidOutAmount: "2500000" }),
    NOW
  );
  assert.equal(projection.settledAmount, "2500000");
  assert.equal(projection.unpaidAccrued, "500000");
});

test("a fully settled payment is finished with nothing unpaid", () => {
  // The chain only allows full settlement at or after the end date
  // (streaming-payout.ts rejects settling a stream before it ends), so the
  // realistic finished state is past-end with paidOut at the cap.
  const projection = deriveStreamingExpenseProjection(
    stream({ paidOutAmount: "10000000" }),
    END
  );
  assert.equal(projection.status.kind, "finished");
  assert.equal(projection.unpaidAccrued, "0");
  assert.equal(projection.projectedRemaining, "0");
});

test("unpaid never counts a settled payout twice", () => {
  const projection = deriveStreamingExpenseProjection(
    stream({ paidOutAmount: "3000000" }),
    NOW
  );
  assert.equal(
    BigInt(projection.unpaidAccrued) + BigInt(projection.settledAmount),
    BigInt(projection.accruedToDate)
  );
});

test("unpaid accrual agrees with the payout surface's due amount", () => {
  for (const asOfMs of [START - 1, START, START + 3_600_000, NOW, END, END + DAY_MS]) {
    const fixture = stream({ paidOutAmount: "1500000" });
    assert.equal(
      deriveStreamingExpenseProjection(fixture, asOfMs).unpaidAccrued,
      computeStreamingPaymentDueAmount(fixture, asOfMs)
    );
  }
});

test("a stream paying a native asset keeps its own unit", () => {
  const [lovelaceRow, tokenRow] = deriveStreamingExpenseProjections([
    stream(),
    stream({
      id: "8",
      policyId: "aaaa1111",
      assetName: "746f6b656e",
      amountPerDay: "25"
    })
  ], NOW);
  assert.equal(lovelaceRow.unit, "lovelace");
  assert.equal(tokenRow.unit, "aaaa1111746f6b656e");
  assert.equal(tokenRow.accruedToDate, "75");
});

test("an unreadable field reads as zero instead of throwing", () => {
  const projection = deriveStreamingExpenseProjection(
    stream({ amountPerDay: "not-a-number" }),
    NOW
  );
  assert.equal(projection.accruedToDate, "0");
  assert.equal(projection.unpaidAccrued, "0");
  assert.equal(projection.lifetimeTotal, "0");
});

test("a malformed start date bails to zeros instead of accruing from epoch", () => {
  // Half-picked dates in the editor write an empty string mid-entry. The
  // delegated due-amount helper reads that as no accrual, so the local
  // accrual must not quietly start counting from 1970.
  const projection = deriveStreamingExpenseProjection(
    stream({ startDate: "" }),
    NOW
  );
  assert.equal(projection.accruedToDate, "0");
  assert.equal(projection.unpaidAccrued, "0");
  assert.equal(projection.lifetimeTotal, "0");
  assert.equal(projection.projectedRemaining, "0");
});

test("an unseeded display clock (asOfMs 0) shows an upcoming stream with no accrual", () => {
  const projection = deriveStreamingExpenseProjection(stream(), 0);
  assert.equal(projection.accruedToDate, "0");
  assert.equal(projection.unpaidAccrued, "0");
  assert.equal(projection.status.kind, "upcoming");
});

test("a non-finite clock reads as time zero, not as an exception", () => {
  const projection = deriveStreamingExpenseProjection(stream(), Number.NaN);
  assert.equal(projection.accruedToDate, "0");
  assert.equal(projection.status.kind, "upcoming");
});

test("the projection is identified by its stream id and payee", () => {
  const projection = deriveStreamingExpenseProjection(stream(), NOW);
  assert.equal(projection.streamingPaymentId, "7");
  assert.equal(projection.payoutAddress, "addr_test1payee");
  assert.equal(projection.ratePerDay, "1000000");
  assert.equal(projection.asOfMs, NOW);
});
