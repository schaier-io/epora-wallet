"use client";
import { lockedContractUtxosAtom } from "./atoms/workspace-data.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { resolveWorkspaceTransactionInputs } from "./workspace-transaction-inputs";
import type { createProposalCaptureWriter } from "./workspace-proposal-capture";
import { checkSelectedFundPoolCoverage } from "./workspace-fund-selection";
import { buildReviewedBeneficiaryWithdrawal } from "./beneficiary-withdrawal-review";
import { applyProofOfLifeOverrideToStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { parseNonNegativeIntegerString } from "@/lib/contracts/state-form-encode";
import { buildSttSpendTx, getValidityWindow } from "@/lib/mesh/transactions";
import type { AuthorityPath, OperatorAuthorityPath, SttSpendFormInput } from "@/lib/types/contracts";
import { ALLOWANCE_WITHDRAWAL_ACTION, BENEFICIARY_WITHDRAWAL_ACTION, RENEW_PROOF_OF_LIFE_ACTION, STREAMING_PAYMENT_PAYOUT_ACTION } from "./constants";
import { cloneAssets, cloneStateForm, resolveManageStreamingPaymentsActionAlternative, resolveSttFundPoolInputs, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveProofOfLifeOverrideTimestamp, serializeTransfers, serializeWalletOutputs } from "./helpers";
import type { WorkspaceTransactionsCtx } from "./workspace-transactions-types";

/** Builds STT transitions. Submission stays in the shared preview flow. */
export function createWorkspaceSttBuilder(
  ctx: WorkspaceTransactionsCtx,
  captureProposal: ReturnType<typeof createProposalCaptureWriter>,
  requiredSignerKeyHashesFor: (authorityPath: AuthorityPath) => string[] | undefined
) {
  const { activeInferredSttStateForm, activePaymentKeyHash, activeWallet, jotaiStore, lockingContract, streamingPaymentPayout, withBuildGuard } = ctx;
  const { config, beneficiaryStreamStopId, sttAuthorityPath, sttExtraTransfers, sttInputOutputIndex, sttInputTxHash, sttOutputAssets, sttProofOfLifeOverrideMode, sttProofOfLifeSpecificDateTime, sttStateForm, sttWalletInputs, sttWalletOutputs, updateStateForm } = resolveWorkspaceTransactionInputs(jotaiStore);
  async function buildSttTx(
    mode:
      | "use"
      | "renew-proof-of-life"
      | "update-state"
      | "manage-streaming-payments"
      | "use-allowance"
      | "use-beneficiary"
      | "payout-streaming-payment"
      | "stop-beneficiary-stream"
      | "distribute-beneficiaries",
    authorityPathOverride?: OperatorAuthorityPath
  ) {
    if (mode === "distribute-beneficiaries") {
      // The core builder fixes recipients, amounts and datums from chain state.
      ctx.proposalCaptureRef.current = null;
      return withBuildGuard(mode, () => buildSttSpendTx(activeWallet!, config, mode, {
        sttInputTxHash,
        sttInputOutputIndex: sttInputOutputIndex ? Number(sttInputOutputIndex) : undefined,
        walletInputs: sttWalletInputs.map((ref) => ({ ...ref })),
        beneficiarySignerKeyHash: activePaymentKeyHash ?? undefined
      }));
    }
    if (mode === "stop-beneficiary-stream") {
      // This action derives its State from the consumed STT. Withdrawal drafts
      // and operator-path overrides cannot become part of a stop transaction.
      ctx.proposalCaptureRef.current = null;
      return withBuildGuard(mode, () => buildSttSpendTx(activeWallet!, config, mode, {
        sttInputTxHash,
        sttInputOutputIndex: sttInputOutputIndex ? Number(sttInputOutputIndex) : undefined,
        beneficiaryStreamStopId: parseNonNegativeIntegerString(beneficiaryStreamStopId, "Scheduled payment ID"),
        beneficiarySignerKeyHash: activePaymentKeyHash ?? undefined,
        authorityPath: "beneficiary"
      }));
    }
    const effectiveAuthorityPath = authorityPathOverride ?? sttAuthorityPath;
    const effectiveWalletInputs = resolveSttFundPoolInputs(mode, sttWalletInputs);
    return withBuildGuard(
      mode,
      async () => {
        // Build against a fresh validity window. The displayed payout quote was
        // computed from an earlier LOWER bound, so it is conservative as time
        // advances; the pure builder re-check below is the final exact cap.
        const validityWindowReferenceTimeMs = Date.now();
        const validityWindow = getValidityWindow(validityWindowReferenceTimeMs);
        if (mode !== "payout-streaming-payment") {
          jotaiStore.set(renderNowMsAtom, validityWindowReferenceTimeMs);
        }
        let effectiveForm = mode === "update-state"
          ? cloneStateForm(updateStateForm)
          : mode === "manage-streaming-payments"
            ? cloneStateForm(sttStateForm)
            : cloneStateForm(activeInferredSttStateForm);

        if (mode === "use" || mode === "renew-proof-of-life") {
          const specificTimestamp = resolveProofOfLifeOverrideTimestamp(
            sttProofOfLifeOverrideMode,
            sttProofOfLifeSpecificDateTime,
            "Choose a proof of life date before you continue."
          );

          effectiveForm = applyProofOfLifeOverrideToStateForm(
            effectiveForm,
            sttProofOfLifeOverrideMode,
            specificTimestamp,
            getValidityWindow(validityWindowReferenceTimeMs)
          );
        }

        const walletWitness =
          mode === "use"
            ? resolveUseActionAlternative(effectiveAuthorityPath)
            : mode === "renew-proof-of-life"
              ? RENEW_PROOF_OF_LIFE_ACTION
            : mode === "update-state"
              ? resolveUpdateStateActionAlternative(effectiveAuthorityPath)
              : mode === "manage-streaming-payments"
                ? resolveManageStreamingPaymentsActionAlternative(effectiveAuthorityPath)
                : mode === "use-beneficiary"
                  ? BENEFICIARY_WITHDRAWAL_ACTION
                  : mode === "payout-streaming-payment"
                      ? STREAMING_PAYMENT_PAYOUT_ACTION
                      : ALLOWANCE_WITHDRAWAL_ACTION;

        const effectiveOutputAssets =
          mode === "use" ||
          mode === "update-state" ||
          mode === "manage-streaming-payments"
            ? cloneAssets(sttOutputAssets)
            : [];
        const effectiveWalletOutputs =
          mode === "update-state" || mode === "manage-streaming-payments"
            ? serializeWalletOutputs(sttWalletOutputs)
            : [];
        const effectiveExtraTransfers =
          mode === "payout-streaming-payment"
            ? streamingPaymentPayout.extraTransfers
            : serializeTransfers(sttExtraTransfers);

        if (
          mode !== "payout-streaming-payment" &&
          effectiveWalletInputs.length > 0 &&
          effectiveExtraTransfers.length > 0
        ) {
          const coverage = checkSelectedFundPoolCoverage({
            lockedUtxos: jotaiStore.get(lockedContractUtxosAtom),
            selectedRefs: effectiveWalletInputs,
            transfers: effectiveExtraTransfers,
            streamingPayments: activeInferredSttStateForm.streamingPayments,
            txLatestTimeMs: validityWindow.latestTimeMs,
            continuingOutputAddress: lockingContract.address ?? undefined
          });
          if (coverage === "insufficient") {
            throw new Error(
              "Selected fund pools no longer cover the transfer and current scheduled-payment reserve. Pick enough funds again."
            );
          }
        }

        const payload: SttSpendFormInput = {
          sttInputTxHash,
          sttInputOutputIndex: sttInputOutputIndex ? Number(sttInputOutputIndex) : undefined,
          outputDatum: stateFormToDatum(effectiveForm, walletWitness),
          outputAssets: effectiveOutputAssets,
          authorityPath: effectiveAuthorityPath,
          validityWindowReferenceTimeMs,
          allowanceSignerKeyHash:
            mode === "use-allowance" ? activePaymentKeyHash ?? undefined : undefined,
          beneficiarySignerKeyHash:
            mode === "use-beneficiary" ? activePaymentKeyHash ?? undefined : undefined,
          // The connected wallet starts as the crank's primary signer. Pass its key
          // hash with any extra required signer hashes so the builder can evaluate
          // the full authority set and preserve the cooldown stamp when an ADMIN is
          // present (the only cadence-exempt crank; whitepaper: Settlement-cadence
          // theorem).
          crankSignerKeyHash:
            mode === "payout-streaming-payment"
              ? activePaymentKeyHash ?? undefined
              : undefined,
          // A multisig draft whose threshold exceeds the proposer's own power can
          // never pass the build-time evaluation on the proposer's key alone, so it
          // lists the remaining power holders up front (see the helper for the full
          // rule). Other paths add no co-signers here.
          requiredSignerKeyHashes:
            requiredSignerKeyHashesFor(effectiveAuthorityPath),
          walletInputs: effectiveWalletInputs.map((entry) => ({ ...entry })),
          walletOutputs: effectiveWalletOutputs,
          extraTransfers: effectiveExtraTransfers
        };

        // Capture for "Save as approval request": only the operator paths
        // (admin / multisig) are proposable, and only when the wallet identity
        // is known. Single-signer paths (user/beneficiary/rule-driven) don't
        // need a proposal.
        if (effectiveAuthorityPath === "admin" || effectiveAuthorityPath === "multisig") {
          captureProposal(mode, effectiveAuthorityPath, {
            builder: "stt-spend",
            mode,
            config: { ...config },
            input: payload
          });
        }

        const build = () => buildSttSpendTx(activeWallet!, config, mode, payload);
        return mode === "use-beneficiary"
          ? buildReviewedBeneficiaryWithdrawal(lockingContract.address, build)
          : build();
      },
      {
        sttInputTxHash,
        sttInputOutputIndex,
        walletInputRefs: effectiveWalletInputs.map((entry) => ({ ...entry })),
        lockedWalletInputCount: effectiveWalletInputs.length,
        lockedWalletOutputCount:
          mode === "update-state" || mode === "manage-streaming-payments" ? sttWalletOutputs.length : 0,
        extraTransferCount:
          mode === "payout-streaming-payment"
            ? streamingPaymentPayout.extraTransfers.length
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

  return { buildSttTx };
}
