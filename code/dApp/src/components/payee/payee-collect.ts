//// Pure planning for the action that actually pays the payee: the stakeholder-authorized
//// crank (`PayStreamingPayment`). Planning needs no wallet connection, so every
//// refusal reason is unit-testable.
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
  maximumAdaSpendWithChange,
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
 * The payout selects enough loaded fund pools to cover the accrued amount. If
 * their aggregate balance is too small, settle that balance and leave the rest
 * for a later transaction. The on-chain payout transition accepts partial progress.
 */
export function planPayeeCollect(
  payment: PayeeStreamingPayment,
  lockedUtxos: UTxO[],
  validityWindow: { earliestTimeMs: number; latestTimeMs: number },
  options: { bypassCooldown?: boolean } = {}
): PayeeCollectPlan {
  const cooldownRemainingMs = nonAdminStreamingActionCooldownRemainingMs(
    payment.lastNonAdminPayoutAt,
    validityWindow.earliestTimeMs
  );
  if (!options.bypassCooldown && cooldownRemainingMs > 0) {
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
  const availableQuantity = lockedUtxos.reduce(
    (total, utxo) => total + heldQuantity(utxo, unit),
    0n
  );
  if (availableQuantity <= 0n) {
    return {
      status: "blocked",
      reason: i18n("thePayingWalletCannotPayInFull", {
        held: describeAmount(availableQuantity, payment),
        owed: describeAmount(dueQuantity, payment)
      })
    };
  }

  let quantity = (
    dueQuantity < availableQuantity ? dueQuantity : availableQuantity
  ).toString();

  // PayStreamingPayment is the one wallet action exempt from the reserve gate.
  // Keep an empty reserve here so an under-funded stream can still settle.
  let walletInputs = suggestLockedInputsForSpend(
    lockedUtxos,
    [{ unit, quantity }],
    []
  );
  if (walletInputs.length === 0 && unit === "lovelace") {
    const partialQuantity = maximumAdaSpendWithChange(lockedUtxos, BigInt(quantity));
    if (partialQuantity > 0n && partialQuantity < BigInt(quantity)) {
      quantity = partialQuantity.toString();
      walletInputs = suggestLockedInputsForSpend(lockedUtxos, [{ unit, quantity }]);
    }
  }
  if (walletInputs.length === 0) {
    return {
      status: "blocked",
      reason: i18n("thePayingWalletCannotSelectFundPools")
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
  return { status: "ready", quantity, unit, transfers, walletInputs };
}
