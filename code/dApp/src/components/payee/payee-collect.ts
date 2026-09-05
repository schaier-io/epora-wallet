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
import { MAX_BOUNDED_WALLET_NATIVE_ASSETS } from "@/lib/contracts/transaction-limits";
import {
  buildStreamingPaymentPayoutTransfer,
  requestedTransferAssets,
  suggestLockedInputsForSpend
} from "@/lib/user-flow/guided-helpers";
import type { PayoutTransfer, WalletInputRef } from "@/lib/types/contracts";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { createDefaultTranslator, defaultFormatter } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsPayeePayeeCollect.json";

const i18n = createDefaultTranslator("ComponentsPayeePayeeCollect", defaultMessages);

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

function heldQuantity(utxo: UTxO, unit: string): bigint {
  return utxo.output.amount
    .filter((asset) => asset.unit === unit)
    .reduce((sum, asset) => sum + BigInt(asset.quantity), 0n);
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
 * The payout spends one fund pool. If no pool holds the full accrued amount, settle the
 * largest positive pool and leave the rest for a later transaction. The on-chain payout
 * transition accepts that partial progress.
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
      reason: i18n("thisWalletSettledAPaymentRecently")
    };
  }

  if (!payment.payoutAddress.trim()) {
    return {
      status: "blocked",
      reason: i18n("thePayoutAddressCouldNotBeRead")
    };
  }

  const dueQuantity = BigInt(
    computePayeeDueAmount(payment, validityWindow.earliestTimeMs)
  );
  if (dueQuantity <= 0n) {
    return {
      status: "blocked",
      reason: i18n("nothingIsOwedYet")
    };
  }

  const unit = payoutUnit(payment);
  const availableQuantity = lockedUtxos.reduce((largest, utxo) => {
    const held = heldQuantity(utxo, unit);
    return held > largest ? held : largest;
  }, 0n);
  if (availableQuantity <= 0n) {
    return {
      status: "blocked",
      reason: i18n("thePayingWalletCannotPayInFull", {
        held: describeAmount(availableQuantity, payment),
        owed: describeAmount(dueQuantity, payment)
      })
    };
  }

  const quantity = (
    dueQuantity < availableQuantity ? dueQuantity : availableQuantity
  ).toString();

  const transfers = [
    buildStreamingPaymentPayoutTransfer(
      toStreamingPaymentForm(payment),
      quantity,
      payment.sttInputTxHash,
      payment.sttInputOutputIndex
    )
  ];
  // PayStreamingPayment is the one wallet action exempt from the reserve gate.
  // Keep an empty reserve here so an under-funded stream can still settle.
  const walletInputs = suggestLockedInputsForSpend(
    lockedUtxos,
    requestedTransferAssets(transfers),
    true,
    []
  );
  if (walletInputs.length === 0) {
    return {
      status: "blocked",
      reason: i18n("thePayingWalletNeedsOneFundPool", {
        maxAssets: MAX_BOUNDED_WALLET_NATIVE_ASSETS
      })
    };
  }

  return { status: "ready", quantity, unit, transfers, walletInputs };
}
