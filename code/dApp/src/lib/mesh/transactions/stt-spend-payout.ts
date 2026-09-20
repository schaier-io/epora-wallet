import { assertNonAdminStreamingActionWindow } from "@/lib/contracts/crank-cooldown";
import { deriveStreamingPaymentPayoutStateDatum } from "@/lib/contracts/streaming-payout";
import type { ConstrData, PayoutTransfer } from "@/lib/types/contracts";

export function resolveStreamingPayoutFundingSource(
  walletInputCount: number
): "smart-wallet" | "connected-wallet" {
  if (!Number.isSafeInteger(walletInputCount) || walletInputCount < 0) {
    throw new Error("Streaming payout wallet input count must be a non-negative integer.");
  }
  return walletInputCount > 0 ? "smart-wallet" : "connected-wallet";
}

/**
 * Mirror the validator's preserve-vs-stamp cadence split before deriving the
 * payout datum. Only the admin/preserve branch bypasses the shared window;
 * every stamping branch must pass the same cooldown and one-hour cap used by
 * receiver cancellation.
 */
export function deriveValidatedStreamingPaymentPayoutStateDatum(
  stateDatum: ConstrData,
  transfers: PayoutTransfer[],
  txEarliestTimeMs: number,
  txLatestTimeMs: number,
  preserveCooldownStamp: boolean
) {
  if (!preserveCooldownStamp) {
    assertNonAdminStreamingActionWindow(
      stateDatum,
      txEarliestTimeMs,
      txLatestTimeMs,
      "Streaming payment payout"
    );
  }
  return deriveStreamingPaymentPayoutStateDatum(
    stateDatum,
    transfers,
    txEarliestTimeMs,
    txLatestTimeMs,
    preserveCooldownStamp
  );
}
