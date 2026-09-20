import { deserializeAddress } from "@meshsdk/core";
import type { UTxO } from "@meshsdk/core";
import { deriveBeneficiaryStreamStopStateDatum } from "@/lib/contracts/beneficiary-stream-stop";
import { formatBeneficiaryStopTimestamp } from "./internals/beneficiary-stream-stop-review";
import { deriveAccessIndexRemovalStateDatum } from "@/lib/contracts/access-removal";
import {
  assertNonAdminStreamingActionWindow,
  crankSignersAreAuthorized,
  crankSignersBypassCooldown
} from "@/lib/contracts/crank-cooldown";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import { deriveAllowanceWithdrawalStateDatum } from "@/lib/contracts/use-allowance";
import { isRepeatableBeneficiaryRecovery } from "@/lib/contracts/terminal-recovery";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibMeshTransactionsSttSpend.json";
import { type OnChainStructuredAction } from "@/lib/contracts/action-data";
import { isOnChainInteger } from "@/lib/contracts/on-chain-integer";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import type {
  ConstrData,
  PayoutTransfer,
  SttSpendAction,
  SttSpendFormInput,
  WalletScriptOutput
} from "@/lib/types/contracts";
import { decodeConstrDatumFromUtxo, deriveBeneficiaryWithdrawalId, deriveBeneficiaryWithdrawalStateDatum } from "./internals";
import { deriveValidatedStreamingPaymentPayoutStateDatum } from "./stt-spend-payout";

const i18n = createDefaultTranslator("LibMeshTransactionsSttSpend", defaultMessages);

/** What the per-action derivation contributes to the builder's draft. */
export type SttSpendActionState = {
  effectiveOnChainAction: OnChainStructuredAction;
  effectiveForwardedDatum: ConstrData;
  allowanceTargetUserId: number | bigint | undefined;
  beneficiaryTargetId: number | bigint | undefined;
  repeatableBeneficiaryRecovery: boolean;
  beneficiaryStopWarning: string | undefined;
};

/**
 * Derive the effective redeemer action and the forwarded State datum for the
 * consumed STT state input, per action. Each branch mirrors the validator's
 * preconditions and throws before the transaction can be submitted. The
 * builder calls this once inside `beforeRedeem`, after the wallet inputs are
 * consumed and before the forwarded output is planned.
 */
export function deriveSttSpendActionState(options: {
  action: SttSpendAction;
  input: SttSpendFormInput;
  onChainAction: OnChainStructuredAction;
  scriptInput: UTxO;
  earliestTimeMs: number;
  latestTimeMs: number;
  extraRequiredSignerKeyHashes: string[];
  resolvedWalletInputs: UTxO[];
  walletOutputs: WalletScriptOutput[];
  extraTransfers: PayoutTransfer[];
  effectiveExtraTransfers: PayoutTransfer[];
  signerAddress: string;
  forwardedDatum: ConstrData | null;
}): SttSpendActionState {
  const {
    action,
    input,
    onChainAction,
    scriptInput,
    earliestTimeMs,
    latestTimeMs,
    extraRequiredSignerKeyHashes,
    resolvedWalletInputs,
    walletOutputs,
    extraTransfers,
    effectiveExtraTransfers,
    signerAddress,
    forwardedDatum
  } = options;

  let effectiveOnChainAction = onChainAction;
  let effectiveForwardedDatum: ConstrData;
  let allowanceTargetUserId: number | bigint | undefined;
  let beneficiaryTargetId: number | bigint | undefined;
  let repeatableBeneficiaryRecovery = false;
  let beneficiaryStopWarning: string | undefined;

  if (action === "use-allowance") {
    const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
    if (!sourceStateDatum) {
      throw new Error(
        "Allowance Withdrawal requires an inline STT state datum on the selected input."
      );
    }

    const allowanceComputation = deriveAllowanceWithdrawalStateDatum({
      stateDatum: sourceStateDatum,
      allowanceSignerKeyHash: input.allowanceSignerKeyHash!,
      walletInputAmounts: resolvedWalletInputs.map(
        (walletInput) => walletInput.output.amount
      ),
      walletOutputs,
      extraTransfers,
      txEarliestTimeMs: earliestTimeMs,
      txLatestTimeMs: latestTimeMs
    });

    effectiveOnChainAction = {
      kind: "allowance-withdrawal",
      userId: allowanceComputation.matchedUserId,
      spentAllowance: allowanceComputation.spentAllowance
    };
    effectiveForwardedDatum = unwrapStateDatum(
      allowanceComputation.outputDatum,
      "STT state datum"
    );
    allowanceTargetUserId = allowanceComputation.matchedUserId;
  } else if (action === "use-beneficiary") {
    const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
    if (!sourceStateDatum) {
      throw new Error(
        "Beneficiary Withdrawal requires an inline STT state datum on the selected input."
      );
    }

    if (!input.beneficiarySignerKeyHash?.trim()) {
      throw new Error(
        "Beneficiary Withdrawal requires the connected wallet payment key hash."
      );
    }

    beneficiaryTargetId = deriveBeneficiaryWithdrawalId(
      sourceStateDatum,
      input.beneficiarySignerKeyHash
    );
    repeatableBeneficiaryRecovery =
      action === "use-beneficiary" && isRepeatableBeneficiaryRecovery(sourceStateDatum);
    if (repeatableBeneficiaryRecovery) {
      assertNonAdminStreamingActionWindow(
        sourceStateDatum,
        earliestTimeMs,
        latestTimeMs,
        "Final beneficiary recovery"
      );
    }
    const beneficiaryOutputDatum = deriveBeneficiaryWithdrawalStateDatum(
      sourceStateDatum, beneficiaryTargetId, latestTimeMs
    );
    effectiveOnChainAction = {
      kind: "beneficiary-withdrawal",
      beneficiaryId: beneficiaryTargetId
    };
    effectiveForwardedDatum = unwrapStateDatum(
      beneficiaryOutputDatum,
      "STT state datum"
    );
    if (
      repeatableBeneficiaryRecovery &&
      resolvedWalletInputs.length === 0
    ) {
      throw new Error(
        "Final beneficiary recovery requires at least one selected fund pool."
      );
    }
  } else if (action === "payout-streaming-payment") {
    const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
    if (!sourceStateDatum) {
      throw new Error(
        "Streaming payment payout requires an inline STT state datum on the selected input."
      );
    }

    // AUTHORITY (security review 2026-07): the crank is no longer
    // permissionless. Before final recovery it accepts an admin, a multisig
    // quorum, any listed user, any stream payee, or an unlocked beneficiary.
    // Once the sole beneficiary unlocks, only it or an admin may crank.
    // Refuse a doomed or unsigned transaction before submission.
    if (!input.crankSignerKeyHash) {
      throw new Error(
        "Settling a streaming payment requires an authorized signer. Connect an owner, listed user, payee, or unlocked backup person."
      );
    }
    // The validator judges the whole `extra_signatories` set, so a crank
    // saved for co-signers is judged by the listed keys together.
    const crankSignerKeyHashes = [input.crankSignerKeyHash, ...extraRequiredSignerKeyHashes];
    if (
      !crankSignersAreAuthorized(
        sourceStateDatum,
        crankSignerKeyHashes,
        earliestTimeMs
      )
    ) {
      throw new Error(
        "This wallet cannot settle this scheduled payment. After final recovery opens, only an owner or the final backup person may settle."
      );
    }

    // Cadence clock: only an ADMIN bypasses the 30-minute limit, and an admin
    // crank must PRESERVE the stamp; every other authorized cranker STAMPS the
    // tx upper bound. Decide it the same way the validator would, from the
    // listed signer key hashes, because a disagreement makes the tx fail. The
    // default validity window (~6 min) is well under the on-chain 1h cap.
    const preserveCooldownStamp = crankSignersBypassCooldown(
      sourceStateDatum,
      crankSignerKeyHashes,
      earliestTimeMs
    );
    const payoutComputation = deriveValidatedStreamingPaymentPayoutStateDatum(
      sourceStateDatum,
      effectiveExtraTransfers,
      earliestTimeMs,
      latestTimeMs,
      preserveCooldownStamp
    );
    effectiveOnChainAction = {
      kind: "streaming-payment-payout",
      payoutDelta: payoutComputation.payoutDelta
    };
    effectiveForwardedDatum = unwrapStateDatum(
      payoutComputation.outputDatum,
      "STT state datum"
    );
  } else if (action === "stop-beneficiary-stream") {
    const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
    if (!sourceStateDatum) throw new Error("Stopping a beneficiary stream requires an inline STT state datum.");
    const connectedSigner = deserializeAddress(signerAddress).pubKeyHash;
    if (connectedSigner !== input.beneficiarySignerKeyHash?.trim().toLowerCase()) {
      throw new Error("The beneficiary signer must match the connected wallet payment key hash.");
    }
    const stopped = deriveBeneficiaryStreamStopStateDatum({
      stateDatum: sourceStateDatum,
      beneficiarySignerKeyHash: connectedSigner,
      additionalSignerKeyHashes: extraRequiredSignerKeyHashes,
      streamingPaymentId: input.beneficiaryStreamStopId!,
      txEarliestTimeMs: earliestTimeMs,
      txLatestTimeMs: latestTimeMs
    });
    effectiveOnChainAction = { kind: "stop-beneficiary-stream", beneficiaryId: stopped.beneficiaryId, streamingPaymentId: stopped.streamingPaymentId };
    effectiveForwardedDatum = stopped.outputDatum;
    beneficiaryStopWarning = i18n("beneficiaryStreamStopDetails", {
      id: String(stopped.streamingPaymentId), oldEnd: formatBeneficiaryStopTimestamp(stopped.oldEndDate), cutoff: formatBeneficiaryStopTimestamp(stopped.cutoff),
      paid: stopped.unit === "lovelace" ? formatLovelaceAsAda(String(stopped.paidOutAmount)) : String(stopped.paidOutAmount),
      debt: stopped.unit === "lovelace" ? formatLovelaceAsAda(String(stopped.retainedDebt)) : String(stopped.retainedDebt),
      unit: stopped.unit === "lovelace" ? "ADA" : stopped.unit
    });
  } else if (action === "cancel-streaming-payment") {
    const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
    if (!sourceStateDatum) {
      throw new Error(
        "Cancelling a streaming payment requires an inline STT state datum on the selected input."
      );
    }

    if (
      !isOnChainInteger(input.streamingPaymentCancelId)
    ) {
      throw new Error(
        "Cancelling a streaming payment requires the target streaming-payment id."
      );
    }

    // Shorten the target to the earliest shape-safe cutoff at/after the tx
    // upper bound and advance the shared non-admin streaming-action clock.
    // The connected wallet remains the payee signer. The contract requires
    // this exact cutoff after final recovery opens, so one payment can move
    // the shared clock only once. This builder forwards STT value unchanged.
    const cancellation = deriveStreamingPaymentCancellationStateDatum(
      sourceStateDatum,
      input.streamingPaymentCancelId,
      earliestTimeMs,
      latestTimeMs
    );
    effectiveOnChainAction = {
      kind: "streaming-payment-cancellation",
      streamingPaymentId: input.streamingPaymentCancelId
    };
    effectiveForwardedDatum = unwrapStateDatum(
      cancellation.outputDatum,
      "STT state datum"
    );
  } else if (action === "remove-access-index") {
    const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
    if (!sourceStateDatum) {
      throw new Error(
        "Removing an access entry requires an inline STT state datum on the selected input."
      );
    }

    const removeTarget = input.removeAccessTarget!;
    const removalOutputDatum = deriveAccessIndexRemovalStateDatum(
      sourceStateDatum,
      removeTarget
    );
    effectiveOnChainAction = {
      kind: "remove-access-index",
      operatorPath:
        input.authorityPath === "multisig" ? "multisig" : "admin",
      target: removeTarget
    };
    effectiveForwardedDatum = unwrapStateDatum(
      removalOutputDatum,
      "STT state datum"
    );
  } else {
    effectiveForwardedDatum = forwardedDatum!;
  }

  return {
    effectiveOnChainAction,
    effectiveForwardedDatum,
    allowanceTargetUserId,
    beneficiaryTargetId,
    repeatableBeneficiaryRecovery,
    beneficiaryStopWarning
  };
}
