//// Pure planning for the action that actually pays the payee: the stakeholder-authorized
//// crank (`PayStreamingPayment`). No Mesh/React/browser dependency, so every refusal reason
//// is unit-testable.
////
//// The contract has always let a stream's payee sign their own payout
//// (`crank_accepts_stream_payee_signature`, and `crankSignerIsAuthorized` mirrors it in the
//// builder). The page offered them only `Shorten payment`, a destructive button that cuts
//// their own income and starts the shared 30-minute cooldown. This is the missing half.

import type { UTxO } from "@meshsdk/core";

import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";
import { computePayeeDueAmount, toStreamingPaymentForm } from "@/components/payee/payee-amounts";
import { nonAdminStreamingActionCooldownRemainingMs } from "@/lib/contracts/crank-cooldown";
import {
  buildStreamingPaymentPayoutTransfer,
  requestedTransferAssets,
  suggestLockedInputsForSpend
} from "@/lib/user-flow/guided-helpers";
import type { PayoutTransfer, WalletInputRef } from "@/lib/types/contracts";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { defaultFormatter } from "@/i18n/default-translator";

export type PayeeCollectPlan =
  | {
      status: "ready";
      quantity: string;
      unit: string;
      transfers: PayoutTransfer[];
      walletInputs: WalletInputRef[];
    }
  | { status: "blocked"; reason: string };

export function payoutUnit(payment: PayeeStreamingPayment): string {
  const policyId = payment.policyId.trim();
  return policyId ? `${policyId}${payment.assetName.trim()}` : "lovelace";
}

function heldQuantity(utxos: UTxO[], unit: string): bigint {
  return utxos.reduce((total, utxo) => {
    const held = utxo.output.amount
      .filter((asset) => asset.unit === unit)
      .reduce((sum, asset) => sum + BigInt(asset.quantity), 0n);
    return total + held;
  }, 0n);
}

// Amounts in a refusal have to read in the same unit as the row above them, or "holds 12 of
// the 38 owed" turns into two numbers a million apart.
function describeAmount(quantity: bigint, payment: PayeeStreamingPayment): string {
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return `${formatLovelaceAsAda(quantity)} ADA`;
  }
  const label = payment.assetName.length > 0
    ? payment.assetName
    : `${payment.policyId.slice(0, 8)}\u2026`;
  return `${defaultFormatter.number(quantity)} ${label}`;
}

/**
 * Decide whether this payee can settle this payment right now, and with which inputs.
 *
 * The shortfall check is a floor, not the on-chain rule: a wallet with live schedules must
 * also keep a reserve in its change, so holding exactly what is owed can still be refused by
 * the validator. Catching the obvious case here turns the common failure into a sentence
 * instead of a build error; `deriveValidatedStreamingPaymentPayoutStateDatum` remains the
 * final word.
 */
export function planPayeeCollect(
  payment: PayeeStreamingPayment,
  lockedUtxos: UTxO[],
  validityWindow: { earliestTimeMs: number; latestTimeMs: number }
): PayeeCollectPlan {
  const cooldownRemainingMs = nonAdminStreamingActionCooldownRemainingMs(
    payment.lastNonAdminPayoutAt,
    validityWindow.earliestTimeMs
  );
  if (cooldownRemainingMs > 0) {
    return {
      status: "blocked",
      reason:
        "This wallet settled a payment recently. It shares one 30-minute cooldown across every receiver action, so collecting has to wait."
    };
  }

  if (!payment.payoutAddress.trim()) {
    return {
      status: "blocked",
      reason: "The payout address on this payment could not be read, so no payout can be built."
    };
  }

  const quantity = computePayeeDueAmount(payment, validityWindow.earliestTimeMs);
  if (BigInt(quantity) <= 0n) {
    return {
      status: "blocked",
      reason: "Nothing is owed to you yet. The amount grows each day the schedule runs."
    };
  }

  const unit = payoutUnit(payment);
  const held = heldQuantity(lockedUtxos, unit);
  if (held < BigInt(quantity)) {
    return {
      status: "blocked",
      reason: `The paying wallet holds ${describeAmount(held, payment)} of the ${describeAmount(
        BigInt(quantity),
        payment
      )} owed to you, so it cannot pay in full yet.`
    };
  }

  const transfers = [
    buildStreamingPaymentPayoutTransfer(
      toStreamingPaymentForm(payment),
      quantity,
      payment.sttInputTxHash,
      payment.sttInputOutputIndex
    )
  ];
  // `true`: this wallet has at least this streaming payment, so the selection must be
  // reserve-aware and take every pool rather than the smallest covering set.
  const walletInputs = suggestLockedInputsForSpend(
    lockedUtxos,
    requestedTransferAssets(transfers),
    true
  );
  if (walletInputs.length === 0) {
    return {
      status: "blocked",
      reason: "The paying wallet has no locked funds to pay from right now."
    };
  }

  return { status: "ready", quantity, unit, transfers, walletInputs };
}
