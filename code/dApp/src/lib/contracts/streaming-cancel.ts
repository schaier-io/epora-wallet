//// Pure derivation of the forwarded STT state datum for a payee self-cancel
//// (`CancelStreamingPayment`). Kept Mesh/browser-free and unit-testable: the
//// forwarded datum MUST mirror the on-chain `State` exactly or the STT validator
//// rejects the transaction. Mirrors the on-chain `is_payee_cancelled` rule:
//// only the targeted streaming payment's `end_date` and the State's shared
//// non-admin streaming-action cooldown stamp move.

import { assertNonAdminStreamingActionWindow } from "@/lib/contracts/crank-cooldown";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import type { ConstrData } from "@/lib/types/contracts";
import { readInteger } from "@/lib/contracts/plutus-primitives";
import {
  assertNonNegativeUint64,
  type OnChainInteger,
  toOnChainBigInt
} from "@/lib/contracts/on-chain-integer";

// State datum field layout (matches the on-chain `State` constructor order).
const STATE_STREAMING_PAYMENTS_INDEX = 2;
const STATE_LAST_NON_ADMIN_PAYOUT_AT_INDEX = 5;

// StreamingPayment constructor field layout (matches the on-chain record order:
// id, payout_address, paid_out_amount, policy_id, asset_name, amount_per_day,
// start_date, end_date).
const STREAMING_PAYMENT_FIELD_COUNT = 8;
const STREAMING_PAYMENT_ID_INDEX = 0;
const STREAMING_PAYMENT_START_DATE_INDEX = 6;
const STREAMING_PAYMENT_END_DATE_INDEX = 7;

export type StreamingPaymentCancellationComputation = {
  outputDatum: ConstrData;
};

/**
 * Compute the forwarded STT state datum for a payee self-cancel: the streaming
 * payment `streamingPaymentId` gets the earliest shape-safe cutoff allowed by
 * the transaction: `max(start_date, tx upper bound)`. Every other payment and
 * field is preserved, except `State.last_non_admin_payout_at`, which advances to
 * `Some(tx upper bound)` for the shared receiver/payout cadence limit.
 *
 * The on-chain validator requires a finite window no wider than one hour, at
 * least 30 minutes since the previous non-admin streaming action, and strict
 * shortening (`new_end < old_end`).
 */
export function deriveStreamingPaymentCancellationStateDatum(
  stateDatum: ConstrData,
  streamingPaymentId: OnChainInteger,
  txEarliestTimeMs: number,
  txLatestTimeMs: number
): StreamingPaymentCancellationComputation {
  const targetId = toOnChainBigInt(streamingPaymentId, "Streaming payment cancellation id");
  assertNonNegativeUint64(targetId, "Streaming payment cancellation id");

  const unwrappedStateDatum = unwrapStateDatum(
    stateDatum,
    "Streaming payment cancellation state datum"
  );
  const sections = readStateSections(
    unwrappedStateDatum,
    "Streaming payment cancellation state datum"
  );
  assertNonAdminStreamingActionWindow(
    unwrappedStateDatum,
    txEarliestTimeMs,
    txLatestTimeMs,
    "Streaming payment cancellation"
  );
  if (unwrappedStateDatum.fields.length < 6) {
    throw new Error(
      "Streaming payment cancellation requires a State datum with the shared cooldown field."
    );
  }
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
    if (BigInt(readInteger(id, `Streaming payment cancellation streamingPayments[${index}].id`)) !== targetId) {
      return streamingPayment;
    }

    const currentEndDate = BigInt(readInteger(
      streamingPayment.fields[STREAMING_PAYMENT_END_DATE_INDEX],
      `Streaming payment cancellation streamingPayments[${index}].end_date`
    ));
    const startDate = BigInt(readInteger(
      streamingPayment.fields[STREAMING_PAYMENT_START_DATE_INDEX],
      `Streaming payment cancellation streamingPayments[${index}].start_date`
    ));

    // Preserve the valid start <= end shape without charging a synthetic 1 ms
    // at high rates when a receiver stops a stream before accrual begins.
    const latestTime = BigInt(txLatestTimeMs);
    const cappedEndDate = startDate > latestTime ? startDate : latestTime;
    if (cappedEndDate >= currentEndDate) {
      throw new Error(
        `Streaming payment ${streamingPaymentId} ends too soon to shorten within this transaction's safe validity window.`
      );
    }

    matched = true;
    const nextFields = [...streamingPayment.fields];
    nextFields[STREAMING_PAYMENT_END_DATE_INDEX] = cappedEndDate <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(cappedEndDate)
      : cappedEndDate;
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
  nextStateFields[STATE_LAST_NON_ADMIN_PAYOUT_AT_INDEX] = {
    alternative: 0,
    fields: [txLatestTimeMs]
  };

  return {
    outputDatum: {
      ...unwrappedStateDatum,
      fields: nextStateFields
    }
  };
}
