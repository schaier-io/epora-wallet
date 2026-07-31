//// Pure derivation of the forwarded STT state datum for a streaming-payment
//// payout (the stakeholder-authorized "crank", `PayStreamingPayment`). Extracted from
//// `lib/mesh/transactions.ts` so it carries no Mesh/browser dependencies and
//// can be unit-tested directly — the forwarded datum MUST mirror the on-chain
//// `State` exactly or the STT validator rejects the transaction.

import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import type { Asset, ConstrData, PayoutTransfer } from "@/lib/types/contracts";

function readIntData(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return value;
}

function readByteArrayData(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a byte-array string.`);
  }
  return value;
}

function unitFromPolicyAsset(policyId: string, assetName: string): string {
  return policyId.length === 0 && assetName.length === 0
    ? "lovelace"
    : `${policyId}${assetName}`;
}

function quantityToSafeInteger(quantity: bigint, label: string): number {
  const asNumber = Number(quantity);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(`${label} is outside the supported integer range.`);
  }
  return asNumber;
}

export type StreamingPaymentPayoutComputation = {
  payoutDelta: Asset[];
  outputDatum: ConstrData;
  removedStreamingPaymentIds: number[];
};

/**
 * Bind payout OutputId tags to the STT input actually selected from chain.
 * The resolver may recover from a stale cached reference by finding the moved
 * STT NFT; retaining the cached tag would make the otherwise-correct payout
 * fail the validator's source-reference check.
 */
export function retagStreamingPaymentPayoutTransfers(
  transfers: PayoutTransfer[],
  sttInputTxHash: string,
  sttInputOutputIndex: number
): PayoutTransfer[] {
  if (!/^[0-9a-fA-F]{64}$/.test(sttInputTxHash)) {
    throw new Error("Resolved STT input transaction hash must be 32-byte hexadecimal data.");
  }
  if (!Number.isSafeInteger(sttInputOutputIndex) || sttInputOutputIndex < 0) {
    throw new Error("Resolved STT input output index must be a non-negative safe integer.");
  }

  return transfers.map((transfer, index) => {
    const tag = transfer.inlineDatum;
    if (!tag || tag.alternative !== 0 || tag.fields.length !== 3) {
      throw new Error(
        `Streaming payment payout transfer ${index + 1} must include an OutputId inline datum.`
      );
    }
    const streamingPaymentId = readIntData(
      tag.fields[0],
      `Streaming payment payout transfer ${index + 1}.inlineDatum.id`
    );
    return {
      ...transfer,
      inlineDatum: {
        ...tag,
        fields: [streamingPaymentId, sttInputTxHash, sttInputOutputIndex]
      }
    };
  });
}

const MILLISECONDS_PER_DAY = 86_400_000n;

type StreamingPaymentPayoutRecord = {
  amountPerDay: bigint;
  endDate: bigint;
  lifetimeTotal: bigint;
  paidOutAmount: bigint;
  startDate: bigint;
  unit: string;
};

function payoutForElapsedTime(elapsedTimeMs: bigint, amountPerDay: bigint): bigint {
  return (elapsedTimeMs * amountPerDay) / MILLISECONDS_PER_DAY;
}

/**
 * Compute the `PayStreamingPayment` payout delta and the forwarded STT state
 * datum from the input state and the tagged payout transfers.
 *
 * The forwarded datum preserves every state field and advances each settled
 * streaming payment's `paid_out_amount`. The 6th `State` field,
 * `last_non_admin_payout_at`, depends on WHO cranks:
 *   - a NON-ADMIN crank (`preserveCooldownStamp = false`, the default — a
 *     multisig quorum, a listed user, a stream payee, or an unlocked beneficiary)
 *     MUST stamp it with the tx upper bound (`txLatestTimeMs`, the
 *     `invalid_hereafter` POSIX time) — the on-chain cadence check requires
 *     `output.last_non_admin_payout_at == Some(tx_latest)`;
 *   - an ADMIN crank (`preserveCooldownStamp = true`, see
 *     `crank-cooldown.crankSignerBypassesCooldown`) bypasses the cadence limit and
 *     MUST leave the field unchanged; the on-chain admin branch rejects a datum
 *     that advances it.
 * Since the 2026-07 security review the crank also requires a signature from one
 * of those parties — see `crank-cooldown.crankSignerIsAuthorized`.
 * Choosing the wrong branch makes the crank tx fail, so the caller must mirror
 * the on-chain bypass predicate. In particular `wallet_name` (the 4th field) and
 * `intended_stake_credential` (the 5th) are always preserved: dropping any field
 * produces a datum the on-chain `expect output_state: State = output_datum`
 * cannot decode.
 */
export function deriveStreamingPaymentPayoutStateDatum(
  stateDatum: ConstrData,
  transfers: PayoutTransfer[],
  txEarliestTimeMs: number,
  txLatestTimeMs: number,
  preserveCooldownStamp = false
): StreamingPaymentPayoutComputation {
  if (!Number.isSafeInteger(txEarliestTimeMs)) {
    throw new Error(
      "Streaming payment payout tx lower-bound time must be a safe integer (POSIX ms)."
    );
  }
  if (!Number.isSafeInteger(txLatestTimeMs)) {
    throw new Error(
      "Streaming payment payout tx upper-bound time must be a safe integer (POSIX ms)."
    );
  }
  if (txEarliestTimeMs > txLatestTimeMs) {
    throw new Error(
      "Streaming payment payout tx lower bound cannot be later than its upper bound."
    );
  }

  const unwrappedStateDatum = unwrapStateDatum(
    stateDatum,
    "Streaming payment payout state datum"
  );
  const sections = readStateSections(
    unwrappedStateDatum,
    "Streaming payment payout state datum"
  );
  const streamingPayments = sections.streamingPayments;

  const streamingPaymentById = new Map<number, StreamingPaymentPayoutRecord>();

  streamingPayments.forEach((streamingPayment, index) => {
    if (
      !isConstrData(streamingPayment) ||
      streamingPayment.alternative !== 0 ||
      streamingPayment.fields.length !== 8
    ) {
      throw new Error(
        `Streaming payment payout streamingPayments[${index}] must be a StreamingPayment constructor.`
      );
    }

    const streamingPaymentId = readIntData(
      streamingPayment.fields[0],
      `Streaming payment payout streamingPayments[${index}].id`
    );
    const policyId = readByteArrayData(
      streamingPayment.fields[3],
      `Streaming payment payout streamingPayments[${index}].policy_id`
    );
    const assetName = readByteArrayData(
      streamingPayment.fields[4],
      `Streaming payment payout streamingPayments[${index}].asset_name`
    );
    const paidOutAmount = readIntData(
      streamingPayment.fields[2],
      `Streaming payment payout streamingPayments[${index}].paid_out_amount`
    );
    const amountPerDay = readIntData(
      streamingPayment.fields[5],
      `Streaming payment payout streamingPayments[${index}].amount_per_day`
    );
    const startDate = readIntData(
      streamingPayment.fields[6],
      `Streaming payment payout streamingPayments[${index}].start_date`
    );
    const endDate = readIntData(
      streamingPayment.fields[7],
      `Streaming payment payout streamingPayments[${index}].end_date`
    );

    if (streamingPaymentById.has(streamingPaymentId)) {
      throw new Error(
        `Streaming payment payout contains duplicate streaming payment id ${streamingPaymentId}.`
      );
    }

    const startDateBigInt = BigInt(startDate);
    const endDateBigInt = BigInt(endDate);
    const amountPerDayBigInt = BigInt(amountPerDay);
    const lifetimeTotal = payoutForElapsedTime(
      endDateBigInt - startDateBigInt,
      amountPerDayBigInt
    );

    streamingPaymentById.set(streamingPaymentId, {
      amountPerDay: amountPerDayBigInt,
      endDate: endDateBigInt,
      lifetimeTotal,
      paidOutAmount: BigInt(paidOutAmount),
      startDate: startDateBigInt,
      unit: unitFromPolicyAsset(policyId, assetName)
    });
  });

  const deltaByStreamingPaymentId = new Map<number, bigint>();
  const payoutDeltaByUnit = new Map<string, bigint>();

  transfers.forEach((transfer, index) => {
    if (
      !transfer.inlineDatum ||
      transfer.inlineDatum.alternative !== 0 ||
      transfer.inlineDatum.fields.length !== 3
    ) {
      throw new Error(
        `Streaming payment payout transfer ${index + 1} must include an OutputId inline datum.`
      );
    }

    const streamingPaymentId = readIntData(
      transfer.inlineDatum.fields[0],
      `Streaming payment payout transfer ${index + 1}.inlineDatum.id`
    );
    const streamingPayment = streamingPaymentById.get(streamingPaymentId);
    if (!streamingPayment) {
      throw new Error(
        `Streaming payment payout transfer ${index + 1} references unknown streaming payment id ${streamingPaymentId}.`
      );
    }

    if (deltaByStreamingPaymentId.has(streamingPaymentId)) {
      throw new Error(
        `Streaming payment payout must use exactly one tagged output for streaming payment ${streamingPaymentId}.`
      );
    }

    const expectedUnit = streamingPayment.unit;

    let matchedQuantity = 0n;
    for (const asset of transfer.amount) {
      const quantity = BigInt(asset.quantity);
      if (quantity <= 0n) {
        continue;
      }

      if (asset.unit !== expectedUnit) {
        throw new Error(
          `Streaming payment payout transfer ${index + 1} can only pay ${expectedUnit} for streaming payment ${streamingPaymentId}.`
        );
      }

      matchedQuantity += quantity;
    }

    if (matchedQuantity <= 0n) {
      throw new Error(
        `Streaming payment payout transfer ${index + 1} must include a positive ${expectedUnit} amount.`
      );
    }

    deltaByStreamingPaymentId.set(
      streamingPaymentId,
      (deltaByStreamingPaymentId.get(streamingPaymentId) ?? 0n) + matchedQuantity
    );
    payoutDeltaByUnit.set(
      expectedUnit,
      (payoutDeltaByUnit.get(expectedUnit) ?? 0n) + matchedQuantity
    );
  });

  const removedStreamingPaymentIds: number[] = [];
  const txEarliest = BigInt(txEarliestTimeMs);
  const nextStreamingPayments = streamingPayments.flatMap((streamingPayment) => {
    const streamingPaymentDatum = streamingPayment as ConstrData;
    const streamingPaymentId = readIntData(
      streamingPaymentDatum.fields[0],
      "Streaming payment payout streaming payment id"
    );
    const payment = streamingPaymentById.get(streamingPaymentId)!;
    const payoutDelta = deltaByStreamingPaymentId.get(streamingPaymentId) ?? 0n;

    if (payment.paidOutAmount > payment.lifetimeTotal) {
      throw new Error(
        `Streaming payment ${streamingPaymentId} is paid beyond its lifetime total.`
      );
    }

    // The validator removes an entry that was already fully settled on input,
    // including floor-rounded schedules whose lifetime total is zero. No tagged
    // output is needed because the declared value delta is zero.
    if (payment.paidOutAmount === payment.lifetimeTotal) {
      if (payoutDelta !== 0n) {
        throw new Error(
          `Streaming payment ${streamingPaymentId} is already fully settled and cannot receive another payout.`
        );
      }
      removedStreamingPaymentIds.push(streamingPaymentId);
      return [];
    }

    const accruedAtLowerBound = payoutForElapsedTime(
      (txEarliest < payment.endDate ? txEarliest : payment.endDate) - payment.startDate,
      payment.amountPerDay
    );
    const maxChange =
      accruedAtLowerBound > payment.paidOutAmount
        ? accruedAtLowerBound - payment.paidOutAmount
        : 0n;
    if (payoutDelta > maxChange) {
      throw new Error(
        `Streaming payment ${streamingPaymentId} payout exceeds the amount accrued at the transaction lower bound.`
      );
    }

    const nextPaidOutAmount = payment.paidOutAmount + payoutDelta;
    if (nextPaidOutAmount > payment.lifetimeTotal) {
      throw new Error(
        `Streaming payment ${streamingPaymentId} payout exceeds its lifetime total.`
      );
    }

    if (nextPaidOutAmount === payment.lifetimeTotal) {
      if (payment.endDate > txEarliest) {
        throw new Error(
          `Streaming payment ${streamingPaymentId} cannot be fully settled before its end date.`
        );
      }
      removedStreamingPaymentIds.push(streamingPaymentId);
      return [];
    }

    if (payoutDelta === 0n) {
      return [streamingPaymentDatum];
    }

    const nextFields = [...streamingPaymentDatum.fields];
    nextFields[2] = quantityToSafeInteger(
      nextPaidOutAmount,
      `Streaming payment payout paid-out amount for streaming payment ${streamingPaymentId}`
    );

    return [{
      ...streamingPaymentDatum,
      fields: nextFields
    }];
  });

  if (deltaByStreamingPaymentId.size === 0 && removedStreamingPaymentIds.length === 0) {
    throw new Error(
      "Streaming payment payout requires a tagged payout transfer or a fully settled entry to clean up."
    );
  }

  const payoutDelta = [...payoutDeltaByUnit.entries()].map(([unit, quantity]) => ({
    unit,
    quantity: quantity.toString()
  }));

  // Preserve every other state field by swapping only `streaming_payments`
  // (field index 2), then set the cooldown clock `last_non_admin_payout_at`
  // (field index 5): a NON-ADMIN crank stamps `Some(tx_latest)`, an ADMIN crank
  // leaves it exactly as it was (whitepaper: Settlement-cadence theorem). The input is always a 6-field
  // State (the validator cannot spend an older shape), so index 5 exists.
  const nextStateFields = [...unwrappedStateDatum.fields];
  nextStateFields[2] = nextStreamingPayments;
  if (!preserveCooldownStamp) {
    // Option `Some(tx_latest)` = constructor 0 carrying the POSIX-ms time.
    nextStateFields[5] = { alternative: 0, fields: [txLatestTimeMs] };
  }

  return {
    payoutDelta,
    removedStreamingPaymentIds,
    outputDatum: {
      ...unwrappedStateDatum,
      fields: nextStateFields
    }
  };
}
