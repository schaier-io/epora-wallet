//// Pure derivation of the forwarded STT state datum for a payee self-cancel
//// (`CancelStreamingPayment`). Kept Mesh/browser-free and unit-testable: the
//// forwarded datum MUST mirror the on-chain `State` exactly or the STT validator
//// rejects the transaction. Mirrors the on-chain `is_payee_cancelled` rule —
//// only the targeted streaming payment's `end_date` and one-shot
//// `cancelled_at` marker move, capped/stamped at "now".

import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import type { ConstrData } from "@/lib/types/contracts";

// State datum field layout (matches the on-chain `State` constructor order).
const STATE_STREAMING_PAYMENTS_INDEX = 2;

// StreamingPayment constructor field layout (matches the on-chain record order:
// id, payout_address, paid_out_amount, policy_id, asset_name, amount_per_day,
// start_date, end_date, cancelled_at).
const STREAMING_PAYMENT_FIELD_COUNT = 9;
const STREAMING_PAYMENT_ID_INDEX = 0;
const STREAMING_PAYMENT_START_DATE_INDEX = 6;
const STREAMING_PAYMENT_END_DATE_INDEX = 7;
const STREAMING_PAYMENT_CANCELLED_AT_INDEX = 8;

export type StreamingPaymentCancellationComputation = {
  outputDatum: ConstrData;
};

/**
 * Compute the forwarded STT state datum for a payee self-cancel: the streaming
 * payment `streamingPaymentId` has its `end_date` capped at the tx upper bound
 * (`txLatestTimeMs`, the `invalid_hereafter` POSIX time) — "now" — while every
   * `cancelled_at` changes from None to Some(tx upper bound); every other field
   * and every other payment is preserved exactly.
 *
 * The on-chain validator (`eval_cancel_streaming_payment`) requires real progress
   * The persistent marker makes cancellation genuinely one-shot. A second attempt
   * is rejected even if it proposes another descending validity upper bound.
 */
export function deriveStreamingPaymentCancellationStateDatum(
  stateDatum: ConstrData,
  streamingPaymentId: number,
  txLatestTimeMs: number
): StreamingPaymentCancellationComputation {
  if (!Number.isSafeInteger(txLatestTimeMs)) {
    throw new Error(
      "Streaming payment cancellation tx upper-bound time must be a safe integer (POSIX ms)."
    );
  }

  const unwrappedStateDatum = unwrapStateDatum(
    stateDatum,
    "Streaming payment cancellation state datum"
  );
  const sections = readStateSections(
    unwrappedStateDatum,
    "Streaming payment cancellation state datum"
  );
  const streamingPayments = sections.streamingPayments;

  let matched = false;
  const nextStreamingPayments = streamingPayments.map((streamingPayment, index) => {
    if (
      !isConstrData(streamingPayment) ||
      streamingPayment.alternative !== 0 ||
      streamingPayment.fields.length !== STREAMING_PAYMENT_FIELD_COUNT
    ) {
      throw new Error(
        `Streaming payment cancellation streamingPayments[${index}] must be a StreamingPayment constructor.`
      );
    }

    const id = streamingPayment.fields[STREAMING_PAYMENT_ID_INDEX];
    if (id !== streamingPaymentId) {
      return streamingPayment;
    }

    const currentEndDate = streamingPayment.fields[STREAMING_PAYMENT_END_DATE_INDEX];
    const startDate = streamingPayment.fields[STREAMING_PAYMENT_START_DATE_INDEX];
    if (typeof currentEndDate !== "number" || !Number.isSafeInteger(currentEndDate)) {
      throw new Error(
        `Streaming payment cancellation streamingPayments[${index}].end_date must be a safe integer.`
      );
    }
    if (typeof startDate !== "number" || !Number.isSafeInteger(startDate)) {
      throw new Error(
        `Streaming payment cancellation streamingPayments[${index}].start_date must be a safe integer.`
      );
    }

    const cancelledAt = streamingPayment.fields[STREAMING_PAYMENT_CANCELLED_AT_INDEX];
    if (
      !isConstrData(cancelledAt) ||
      cancelledAt.alternative !== 1 ||
      cancelledAt.fields.length !== 0
    ) {
      throw new Error(`Streaming payment ${streamingPaymentId} has already been cancelled.`);
    }

    // Before accrual starts, a payee cancel closes the stream at exactly its
    // start. Keeping a synthetic +1 ms lifetime would create payable value for
    // high-rate streams even though cancellation happened before the start.
    const cappedEndDate = Math.max(startDate, Math.min(currentEndDate, txLatestTimeMs));
    if (cappedEndDate === currentEndDate) {
      throw new Error(
        `Streaming payment ${streamingPaymentId} already ends at or before now; there is nothing to cancel.`
      );
    }

    matched = true;
    const nextFields = [...streamingPayment.fields];
    nextFields[STREAMING_PAYMENT_END_DATE_INDEX] = cappedEndDate;
    nextFields[STREAMING_PAYMENT_CANCELLED_AT_INDEX] = {
      alternative: 0,
      fields: [txLatestTimeMs]
    };
    return {
      ...streamingPayment,
      fields: nextFields
    };
  });

  if (!matched) {
    throw new Error(
      `Streaming payment cancellation references unknown streaming payment id ${streamingPaymentId}.`
    );
  }

  const nextStateFields = [...unwrappedStateDatum.fields];
  nextStateFields[STATE_STREAMING_PAYMENTS_INDEX] = nextStreamingPayments;

  return {
    outputDatum: {
      ...unwrappedStateDatum,
      fields: nextStateFields
    }
  };
}
