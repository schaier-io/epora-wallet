import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { Asset, PayoutTransfer } from "@/lib/types/contracts";
import {
  readPositiveBigInt,
  serializeAssetTotals,
  toOnChainInteger
} from "@/lib/user-flow/asset-quantities";
import { DURATION_UNIT_MAP } from "@/lib/user-flow/time-inputs";

export function computeStreamingPaymentDueAmount(
  streamingPayment: StreamingPaymentFormState,
  referenceTimeMs: number
): string {
  const paidOut = readPositiveBigInt(streamingPayment.paidOutAmount);
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    paidOut === null ||
    amountPerDay === null ||
    startDate === null ||
    endDate === null
  ) {
    return "0";
  }

  const effectiveEndDate = endDate < BigInt(referenceTimeMs) ? endDate : BigInt(referenceTimeMs);
  if (effectiveEndDate <= startDate) {
    return "0";
  }

  const totalEarned =
    ((effectiveEndDate - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const dueAmount = totalEarned - paidOut;

  return dueAmount > 0n ? dueAmount.toString() : "0";
}

/**
 * Everything this stream still owes anyone at `referenceTimeMs`: the accrued-but-unpaid
 * due plus everything that will still accrue until the end date. A wallet holding funds
 * that back a stream cannot spend them, so an "actually available" balance is the raw
 * balance minus this. `paidOutAmount` is what has been paid as of now, so the unpaid
 * part at a historical point is an approximation -- the schedule is what the chart can
 * know, not the payout history.
 */
export function computeStreamingPaymentRemainingObligation(
  streamingPayment: StreamingPaymentFormState,
  referenceTimeMs: number
): string {
  const paidOut = readPositiveBigInt(streamingPayment.paidOutAmount);
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    paidOut === null ||
    amountPerDay === null ||
    startDate === null ||
    endDate === null ||
    endDate <= startDate
  ) {
    return "0";
  }

  const now = BigInt(referenceTimeMs);
  // Clamp now into [start, end]: before the start nothing has accrued and the whole
  // lifetime is still encumbered; after the end everything has accrued and only the
  // unpaid remainder is owed.
  const accrualEnd = now > endDate ? endDate : now;
  const accrualStart = accrualEnd < startDate ? startDate : accrualEnd;

  const accruedBy = ((accrualStart - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const lifetime = ((endDate - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const unpaid = accruedBy > paidOut ? accruedBy - paidOut : 0n;

  return (unpaid + lifetime - accruedBy).toString();
}

function computeStreamingPaymentReserveQuantity(
  streamingPayment: StreamingPaymentFormState,
  referenceTimeMs: number
): bigint {
  const paidOut = readPositiveBigInt(streamingPayment.paidOutAmount);
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    paidOut === null ||
    amountPerDay === null ||
    startDate === null ||
    endDate === null ||
    endDate < startDate
  ) {
    return 0n;
  }

  const lifetime = ((endDate - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  if (paidOut >= lifetime) {
    return 0n;
  }

  const referenceTime = BigInt(referenceTimeMs);
  if (referenceTime < startDate) {
    return 0n;
  }

  const accrualEnd = referenceTime < endDate ? referenceTime : endDate;
  const accrued = ((accrualEnd - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const reserve = accrued + 1n - paidOut;
  return reserve > 0n ? reserve : 0n;
}

export function computeStreamingPaymentLifetimeAmount(
  streamingPayment: StreamingPaymentFormState
): string | null {
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    amountPerDay === null ||
    startDate === null ||
    endDate === null ||
    endDate < startDate
  ) {
    return null;
  }

  return (
    ((endDate - startDate) * amountPerDay) /
    DURATION_UNIT_MAP.days
  ).toString();
}

/** True when the payout validator requires this input entry to be removed. */
export function streamingPaymentNeedsZeroDeltaCleanup(
  streamingPayment: StreamingPaymentFormState
): boolean {
  const paidOutAmount = readPositiveBigInt(streamingPayment.paidOutAmount);
  const lifetimeAmount = computeStreamingPaymentLifetimeAmount(streamingPayment);

  return (
    paidOutAmount !== null &&
    lifetimeAmount !== null &&
    paidOutAmount >= BigInt(lifetimeAmount)
  );
}

/** The asset unit a stream pays: an empty policy id means plain ADA. */
export function streamingPaymentUnit(streamingPayment: StreamingPaymentFormState): string {
  const policyId = streamingPayment.policyId.trim();
  return policyId
    ? `${policyId}${streamingPayment.assetName.trim()}`
    : "lovelace";
}

/** Exact per-asset reserve used by the wallet validator at the transaction upper bound. */
export function computeStreamingReserveAssets(
  streamingPayments: StreamingPaymentFormState[],
  referenceTimeMs: number
): Asset[] {
  const totals = new Map<string, bigint>();

  for (const streamingPayment of streamingPayments) {
    const quantity = computeStreamingPaymentReserveQuantity(
      streamingPayment,
      referenceTimeMs
    );
    if (quantity > 0n) {
      const unit = streamingPaymentUnit(streamingPayment);
      totals.set(unit, (totals.get(unit) ?? 0n) + quantity);
    }
  }

  return serializeAssetTotals(totals);
}

export function buildStreamingPaymentPayoutTransfer(
  streamingPayment: StreamingPaymentFormState,
  quantity: string,
  sttInputTxHash: string,
  sttInputOutputIndex: number
): PayoutTransfer {
  const unit = streamingPaymentUnit(streamingPayment);
  const streamingPaymentId = readPositiveBigInt(streamingPayment.id);
  if (streamingPaymentId === null) {
    throw new Error("Scheduled payment payout id must be a non-negative integer.");
  }

  return {
    address: streamingPayment.payoutAddress.trim(),
    amount: [{ unit, quantity: quantity.trim() }],
    inlineDatum: {
      alternative: 0,
      fields: [
        toOnChainInteger(streamingPaymentId, "Scheduled payment payout id"),
        sttInputTxHash,
        sttInputOutputIndex
      ]
    }
  };
}
