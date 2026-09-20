//// Pure projection of a scheduled payment's accruing expense at a wall-clock
//// time, for the Activity surface. Read-only display data: nothing here writes
//// state, changes what the payout builder sends, or changes what the Activity
//// list counts as settled. A projection entry is derived from the stream's
//// terms each time it is shown; it is never stored as a chain transaction.

import {
  computeStreamingPaymentDueAmount,
  computeStreamingPaymentLifetimeAmount,
  streamingPaymentNeedsZeroDeltaCleanup,
  streamingPaymentUnit
} from "@/lib/user-flow/streaming-payment-helpers";
import { isNonNegativeUint64Decimal } from "@/lib/contracts/on-chain-integer";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import {
  deriveStreamingPaymentRowStatus,
  type StreamingPaymentRowStatus
} from "./streaming-payment-status";

// The schedule's accrual divisor, mirroring the payout builder and the
// on-chain check (lib/contracts/streaming-payout.ts `payoutForElapsedTime`):
// elapsed milliseconds times the daily rate, divided by whole days, floored.
// Floor (not round) so a projection never promises more than the schedule has
// actually accrued.
const MILLISECONDS_PER_DAY = 86_400_000n;

export type StreamingExpenseProjection = {
  streamingPaymentId: string;
  payoutAddress: string;
  unit: string;
  status: StreamingPaymentRowStatus;
  ratePerDay: string;
  /** Everything the schedule has accrued by `asOfMs`, end date included. */
  accruedToDate: string;
  /** What has actually been paid out (the datum's `paid_out_amount`). */
  settledAmount: string;
  /** `accruedToDate - settledAmount`, floored at zero: the accruing expense no payout has settled yet. */
  unpaidAccrued: string;
  /** The schedule's lifetime cap: `accruedToDate` never passes it. */
  lifetimeTotal: string;
  /** `lifetimeTotal - accruedToDate`, floored at zero: still to accrue if the stream runs to its end date. */
  projectedRemaining: string;
  asOfMs: number;
};

// The form stores datum integers as decimal strings; an unreadable field reads
// as zero rather than throwing, so one malformed row cannot hide the others.
function readNonNegativeBigInt(value: string): bigint {
  const normalized = value.trim();
  return isNonNegativeUint64Decimal(normalized) ? BigInt(normalized) : 0n;
}

// Every clock handed to this module (and to the helpers it delegates to) is a
// display value that may not have seeded yet. A non-finite or negative time
// reads as time zero -- before any start date -- rather than throwing inside a
// BigInt conversion.
function sanitizeAsOfMs(asOfMs: number): number {
  return Number.isFinite(asOfMs) ? Math.max(0, Math.trunc(asOfMs)) : 0;
}

// Clamps the clock into [startDate, endDate] and floors the elapsed accrual,
// exactly the shape the payout builder checks against
// (`streaming-payout.ts:306-309`: accrued at the transaction lower bound).
function accruingBy(
  start: bigint,
  end: bigint,
  ratePerDay: bigint,
  asOfMs: number
): bigint {
  const now = BigInt(asOfMs);
  const accrualEnd = now > end ? end : now;
  if (accrualEnd <= start) {
    return 0n;
  }
  return ((accrualEnd - start) * ratePerDay) / MILLISECONDS_PER_DAY;
}

/**
 * What one scheduled payment has accrued and will still accrue at `asOfMs`.
 *
 * The unpaid figure comes from `computeStreamingPaymentDueAmount`, the same
 * function the payout surface pre-fills and the payee page quotes
 * (`payee-amounts.ts`), so the Activity can never disagree with either about a
 * figure that is someone's money. The status reuses the payout surface's
 * `deriveStreamingPaymentRowStatus`; a fully settled payment reads as finished
 * there and as "nothing unpaid" here, for the same reason.
 */
export function deriveStreamingExpenseProjection(
  streamingPayment: StreamingPaymentFormState,
  asOfMs: number
): StreamingExpenseProjection {
  const asOf = sanitizeAsOfMs(asOfMs);
  const start = readNonNegativeBigInt(streamingPayment.startDate);
  const end = readNonNegativeBigInt(streamingPayment.endDate);
  const ratePerDay = readNonNegativeBigInt(streamingPayment.amountPerDay);
  const settledAmount = readNonNegativeBigInt(streamingPayment.paidOutAmount);

  // A malformed date must not accrue from epoch: the delegated due-amount and
  // lifetime helpers bail to zero on the same input, so the local accrual
  // bails too and the row stays internally consistent.
  const datesValid = isNonNegativeUint64Decimal(streamingPayment.startDate.trim())
    && isNonNegativeUint64Decimal(streamingPayment.endDate.trim());
  const accruedToDate = datesValid ? accruingBy(start, end, ratePerDay, asOf) : 0n;
  const unpaidAccrued = computeStreamingPaymentDueAmount(streamingPayment, asOf);
  const lifetimeTotal = computeStreamingPaymentLifetimeAmount(streamingPayment) ?? "0";
  const lifetimeAmount = BigInt(lifetimeTotal);
  const projectedRemaining = lifetimeAmount > accruedToDate
    ? lifetimeAmount - accruedToDate
    : 0n;

  return {
    streamingPaymentId: streamingPayment.id,
    payoutAddress: streamingPayment.payoutAddress,
    unit: streamingPaymentUnit(streamingPayment),
    status: deriveStreamingPaymentRowStatus({
      cleanupRequired: streamingPaymentNeedsZeroDeltaCleanup(streamingPayment),
      startDateMs: start,
      endDateMs: end,
      nowMs: asOf
    }),
    ratePerDay: ratePerDay.toString(),
    accruedToDate: accruedToDate.toString(),
    settledAmount: settledAmount.toString(),
    unpaidAccrued,
    lifetimeTotal,
    projectedRemaining: projectedRemaining.toString(),
    asOfMs: asOf
  };
}

export function deriveStreamingExpenseProjections(
  streamingPayments: readonly StreamingPaymentFormState[],
  asOfMs: number
): StreamingExpenseProjection[] {
  return streamingPayments.map((streamingPayment) =>
    deriveStreamingExpenseProjection(streamingPayment, asOfMs)
  );
}
