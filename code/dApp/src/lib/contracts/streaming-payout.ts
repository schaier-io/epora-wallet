//// Pure derivation of the forwarded STT state datum for a streaming-payment
//// payout (the permissionless "crank", `PayStreamingPayment`). Extracted from
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
};

/**
 * Compute the `PayStreamingPayment` payout delta and the forwarded STT state
 * datum from the input state and the tagged payout transfers.
 *
 * The forwarded datum preserves every state field and advances each settled
 * streaming payment's `paid_out_amount`. The 6th `State` field,
 * `last_permissionless_payout_at`, depends on WHO cranks (ADR-0009):
 *   - a PERMISSIONLESS crank (`preserveCooldownStamp = false`, the default) MUST
 *     stamp it with the tx upper bound (`txLatestTimeMs`, the `invalid_hereafter`
 *     POSIX time) — the on-chain cooldown check requires
 *     `output.last_permissionless_payout_at == Some(tx_latest)`;
 *   - an AUTHORIZED crank (`preserveCooldownStamp = true` — admin / multisig
 *     quorum / unlocked beneficiary, see `crank-cooldown.crankSignerBypassesCooldown`)
 *     bypasses the cooldown and MUST leave the field unchanged; the on-chain
 *     bypass branch rejects a datum that advances it.
 * Choosing the wrong branch makes the crank tx fail, so the caller must mirror
 * the on-chain bypass predicate. In particular `wallet_name` (the 4th field) and
 * `intended_stake_credential` (the 5th) are always preserved: dropping any field
 * produces a datum the on-chain `expect output_state: State = output_datum`
 * cannot decode.
 */
export function deriveStreamingPaymentPayoutStateDatum(
  stateDatum: ConstrData,
  transfers: PayoutTransfer[],
  txLatestTimeMs: number,
  preserveCooldownStamp = false
): StreamingPaymentPayoutComputation {
  const unwrappedStateDatum = unwrapStateDatum(
    stateDatum,
    "Streaming payment payout state datum"
  );
  const sections = readStateSections(
    unwrappedStateDatum,
    "Streaming payment payout state datum"
  );
  const streamingPayments = sections.streamingPayments;

  const streamingPaymentUnitById = new Map<number, string>();
  const paidOutAmountsById = new Map<number, number>();

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

    streamingPaymentUnitById.set(streamingPaymentId, unitFromPolicyAsset(policyId, assetName));
    paidOutAmountsById.set(streamingPaymentId, paidOutAmount);
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
    const expectedUnit = streamingPaymentUnitById.get(streamingPaymentId);
    if (!expectedUnit) {
      throw new Error(
        `Streaming payment payout transfer ${index + 1} references unknown streaming payment id ${streamingPaymentId}.`
      );
    }

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

  if (deltaByStreamingPaymentId.size === 0) {
    throw new Error("Streaming payment payout requires at least one tagged payout transfer.");
  }

  const nextStreamingPayments = streamingPayments.map((streamingPayment) => {
    const streamingPaymentDatum = streamingPayment as ConstrData;
    const streamingPaymentId = readIntData(
      streamingPaymentDatum.fields[0],
      "Streaming payment payout streaming payment id"
    );
    const payoutDelta = deltaByStreamingPaymentId.get(streamingPaymentId);

    if (!payoutDelta) {
      return streamingPaymentDatum;
    }

    const nextFields = [...streamingPaymentDatum.fields];
    nextFields[2] =
      (paidOutAmountsById.get(streamingPaymentId) ?? 0) +
      quantityToSafeInteger(
        payoutDelta,
        `Streaming payment payout delta for streaming payment ${streamingPaymentId}`
      );

    return {
      ...streamingPaymentDatum,
      fields: nextFields
    };
  });

  const payoutDelta = [...payoutDeltaByUnit.entries()].map(([unit, quantity]) => ({
    unit,
    quantity: quantity.toString()
  }));

  if (!Number.isSafeInteger(txLatestTimeMs)) {
    throw new Error(
      "Streaming payment payout tx upper-bound time must be a safe integer (POSIX ms)."
    );
  }

  // Preserve every other state field by swapping only `streaming_payments`
  // (field index 2), then set the cooldown clock `last_permissionless_payout_at`
  // (field index 5) per ADR-0009: a permissionless crank stamps `Some(tx_latest)`,
  // an authorized crank leaves it exactly as it was. The input is always a 6-field
  // State (the validator cannot spend an older shape), so index 5 exists.
  const nextStateFields = [...unwrappedStateDatum.fields];
  nextStateFields[2] = nextStreamingPayments;
  if (!preserveCooldownStamp) {
    // Option `Some(tx_latest)` = constructor 0 carrying the POSIX-ms time.
    nextStateFields[5] = { alternative: 0, fields: [txLatestTimeMs] };
  }

  return {
    payoutDelta,
    outputDatum: {
      ...unwrappedStateDatum,
      fields: nextStateFields
    }
  };
}
