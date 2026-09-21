import type { OnChainInteger } from "@/lib/contracts/on-chain-integer";
import { stateFormFromDatum } from "@/lib/contracts/state-form";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import type { ConstrData } from "@/lib/types/contracts";
import { computeStreamingPaymentDueAmount } from "@/lib/user-flow/streaming-payment-helpers";

/** Use the same state derivation as the builder, including its cooldown checks. */
export function planPayeeStop(
  stateDatum: ConstrData,
  paymentId: OnChainInteger,
  validityWindow: { earliestTimeMs: number; latestTimeMs: number }
) {
  const { outputDatum } = deriveStreamingPaymentCancellationStateDatum(
    stateDatum, paymentId, validityWindow.earliestTimeMs, validityWindow.latestTimeMs
  );
  const payment = stateFormFromDatum(outputDatum).streamingPayments.find(
    (entry) => BigInt(entry.id) === BigInt(paymentId)
  );
  if (!payment) throw new Error("The stopped payment is missing from the derived state.");
  const cutoff = Number(payment.endDate);
  if (!Number.isSafeInteger(cutoff) || Number.isNaN(new Date(cutoff).getTime())) {
    throw new Error("The payment stop time cannot be displayed safely.");
  }
  return {
    cutoff,
    retainedDebt: computeStreamingPaymentDueAmount(payment, cutoff),
    policyId: payment.policyId,
    assetName: payment.assetName
  };
}
