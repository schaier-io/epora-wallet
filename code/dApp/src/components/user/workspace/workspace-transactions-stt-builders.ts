"use client";
// Builders for the STT spend action family (use / renew-proof-of-life /
// update-state / manage-streaming-payments / use-allowance / use-beneficiary /
// payout-streaming-payment) plus UTxO consolidation. Mint and the wallet
// wrapper operations live in workspace-transactions-wallet-builders.ts.
import { applyProofOfLifeOverrideToStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import {
  buildConsolidateUtxosTx,
  buildSttSpendTx,
  getValidityWindow
} from "@/lib/mesh/transactions";
import {
  type ConsolidateUtxosFormInput,
  type SttSpendFormInput
} from "@/lib/types/contracts";
import { ALLOWANCE_WITHDRAWAL_ACTION, BENEFICIARY_WITHDRAWAL_ACTION, RENEW_PROOF_OF_LIFE_ACTION, STREAMING_PAYMENT_PAYOUT_ACTION } from "@/components/user/workspace/constants";
import { cloneAssets, cloneStateForm, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, serializeTransfers, serializeWalletOutputs } from "@/components/user/workspace/helpers";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import { requireActiveWallet } from "@/components/user/workspace/workspace-transactions-guards";
import type { WorkspaceFormSnapshot } from "@/components/user/workspace/workspace-transactions-forms";

export type SttSpendBuildMode =
  | "use"
  | "renew-proof-of-life"
  | "update-state"
  | "manage-streaming-payments"
  | "use-allowance"
  | "use-beneficiary"
  | "payout-streaming-payment";

export function createSttSpendBuilders(
  ctx: WorkspaceTransactionsCtx,
  forms: WorkspaceFormSnapshot
) {
  const {
    activeInferredSttStateForm,
    activePaymentKeyHash,
    activeWallet,
    effectiveSttAction,
    proposalCaptureRef,
    streamingPaymentPayoutTransfers,
    withBuildGuard
  } = ctx;
  const {
    config,
    consolidateAuthorityPath,
    consolidateSttAssets,
    consolidateSttInputHash,
    consolidateSttInputIndex,
    consolidateWalletInputs,
    consolidateWalletOutputs,
    sttAuthorityPath,
    sttExtraTransfers,
    sttInputOutputIndex,
    sttInputTxHash,
    sttOutputAssets,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime,
    sttStateForm,
    sttWalletInputs,
    sttWalletOutputs,
    setSttStateForm
  } = forms;

  async function buildSttTx(mode: SttSpendBuildMode) {
    return withBuildGuard(
      mode,
      async () => {
        const validityWindowReferenceTimeMs = Date.now();
        let effectiveForm =
          mode === "update-state" || mode === "manage-streaming-payments"
            ? cloneStateForm(sttStateForm)
            : cloneStateForm(activeInferredSttStateForm);

        if (mode === "use" || mode === "renew-proof-of-life") {
          const actionLabel = mode === "use" ? "Use" : "Renew Wake-up timer";
          let specificTimestamp: number | undefined;

          if (sttProofOfLifeOverrideMode === "specific") {
            if (!sttProofOfLifeSpecificDateTime.trim()) {
              throw new Error(`Choose a wake-up timer date before building ${actionLabel}.`);
            }

            const parsedTimestamp = Number(sttProofOfLifeSpecificDateTime);
            if (!Number.isSafeInteger(parsedTimestamp)) {
              throw new Error(
                "Proof-of-life override date must be a valid local date and time."
              );
            }

            specificTimestamp = Math.trunc(parsedTimestamp);
          }

          effectiveForm = applyProofOfLifeOverrideToStateForm(
            effectiveForm,
            sttProofOfLifeOverrideMode,
            specificTimestamp,
            getValidityWindow(validityWindowReferenceTimeMs).latestTimeMs
          );
          setSttStateForm(cloneStateForm(effectiveForm));
        }

        const walletWitness =
          mode === "use"
            ? resolveUseActionAlternative(sttAuthorityPath)
            : mode === "renew-proof-of-life"
              ? RENEW_PROOF_OF_LIFE_ACTION
            : mode === "update-state"
              ? resolveUpdateStateActionAlternative(sttAuthorityPath)
              : mode === "manage-streaming-payments"
                ? resolveManageStreamingPaymentsActionAlternative(sttAuthorityPath)
                : mode === "use-beneficiary"
                  ? BENEFICIARY_WITHDRAWAL_ACTION
                  : mode === "payout-streaming-payment"
                      ? STREAMING_PAYMENT_PAYOUT_ACTION
                      : ALLOWANCE_WITHDRAWAL_ACTION;

        const effectiveOutputAssets =
          mode === "update-state" || mode === "manage-streaming-payments"
            ? cloneAssets(sttOutputAssets)
            : [];
        const effectiveWalletOutputs =
          mode === "update-state" || mode === "manage-streaming-payments"
            ? serializeWalletOutputs(sttWalletOutputs)
            : [];
        const effectiveExtraTransfers =
          mode === "payout-streaming-payment"
            ? streamingPaymentPayoutTransfers
            : serializeTransfers(sttExtraTransfers);

        const payload: SttSpendFormInput = {
          sttInputTxHash,
          sttInputOutputIndex: sttInputOutputIndex ? Number(sttInputOutputIndex) : undefined,
          outputDatum: stateFormToDatum(effectiveForm, walletWitness),
          outputAssets: effectiveOutputAssets,
          authorityPath: sttAuthorityPath,
          validityWindowReferenceTimeMs,
          allowanceSignerKeyHash:
            mode === "use-allowance" ? activePaymentKeyHash ?? undefined : undefined,
          beneficiarySignerKeyHash:
            mode === "use-beneficiary" ? activePaymentKeyHash ?? undefined : undefined,
          // The crank's sole required signer is the connected wallet; pass its key
          // hash so the builder can preserve the cooldown stamp when the signer is
          // authorized (admin / multisig / unlocked beneficiary) — ADR-0009.
          crankSignerKeyHash:
            mode === "payout-streaming-payment"
              ? activePaymentKeyHash ?? undefined
              : undefined,
          walletInputs: sttWalletInputs.map((entry) => ({ ...entry })),
          walletOutputs: effectiveWalletOutputs,
          extraTransfers: effectiveExtraTransfers
        };

        // Capture for "Save as multi-sig proposal": only the operator paths
        // (admin / multisig) are proposable, and only when the wallet identity
        // is known. Single-signer paths (user/beneficiary/rule-driven) don't
        // need a proposal.
        if (
          (sttAuthorityPath === "admin" || sttAuthorityPath === "multisig") &&
          config.walletPolicyId &&
          config.walletAssetNameHex
        ) {
          proposalCaptureRef.current = {
            actionKind: mode,
            authorityPath: sttAuthorityPath,
            builder: "stt-spend",
            buildContext: { builder: "stt-spend", mode, config: { ...config }, input: payload },
            walletUnit: `${config.walletPolicyId}${config.walletAssetNameHex}`,
            walletPolicyId: config.walletPolicyId
          };
        }

        return buildSttSpendTx(requireActiveWallet(activeWallet), config, mode, payload);
      },
      {
        sttInputTxHash,
        sttInputOutputIndex,
        walletInputRefs: sttWalletInputs.map((entry) => ({ ...entry })),
        lockedWalletInputCount: sttWalletInputs.length,
        lockedWalletOutputCount:
          mode === "update-state" || mode === "manage-streaming-payments" ? sttWalletOutputs.length : 0,
        extraTransferCount:
          mode === "payout-streaming-payment"
            ? streamingPaymentPayoutTransfers.length
            : sttExtraTransfers.length,
        proofOfLifeOverrideMode:
          mode === "use" || mode === "renew-proof-of-life"
            ? sttProofOfLifeOverrideMode
            : "ignored",
        proofOfLifeSpecificDateTime:
          (mode === "use" || mode === "renew-proof-of-life") &&
          sttProofOfLifeOverrideMode === "specific"
            ? sttProofOfLifeSpecificDateTime
            : undefined
      }
    );
  }

  async function buildConsolidateUtxos() {
    return withBuildGuard(
      "consolidate-utxo",
      async () => {
        const effectiveForm = cloneStateForm(activeInferredSttStateForm);
        const payload: ConsolidateUtxosFormInput = {
          sttInputTxHash: consolidateSttInputHash,
          sttInputOutputIndex: consolidateSttInputIndex
            ? Number(consolidateSttInputIndex)
            : undefined,
          outputDatum: stateFormToDatum(
            effectiveForm,
            resolveConsolidateActionAlternative(consolidateAuthorityPath)
          ),
          outputAssets: cloneAssets(consolidateSttAssets),
          authorityPath: consolidateAuthorityPath,
          walletInputs: consolidateWalletInputs.map((entry) => ({ ...entry })),
          walletOutputs: serializeWalletOutputs(consolidateWalletOutputs)
        };

        return buildConsolidateUtxosTx(requireActiveWallet(activeWallet), config, payload);
      },
      {
        sttInputTxHash: consolidateSttInputHash,
        sttInputOutputIndex: consolidateSttInputIndex,
        walletInputRefs: consolidateWalletInputs.map((entry) => ({ ...entry })),
        walletInputCount: consolidateWalletInputs.length,
        walletOutputCount: consolidateWalletOutputs.length
      }
    );
  }

  async function buildSelectedSttActionTx() {
    if (effectiveSttAction === "consolidate-utxo") {
      return buildConsolidateUtxos();
    }

    return buildSttTx(effectiveSttAction);
  }

  return {
    buildSttTx,
    buildConsolidateUtxos,
    buildSelectedSttActionTx
  };
}
