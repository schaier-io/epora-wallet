"use client";
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { type SetStateAction } from "react";
// Only the atoms WRITTEN here remain imported; the ~40 atoms the builders READ
// are gathered by resolveWorkspaceTransactionInputs (see below).
import { selectedSttActionAtom, sttExtraTransfersAtom, sttStateFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { resetLockFundsFormAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { resolveWorkspaceTransactionInputs } from "@/components/user/workspace/workspace-transaction-inputs";

import { applyProofOfLifeOverrideToStateForm, countAdminUsersInStateForm, stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import {
  normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import {
  resolveWalletSpendScriptHash,
  resolveWalletStakeScriptCredentialData
} from "@/lib/contracts/blueprint";

import {
  buildConsolidateUtxosTx,
  buildLockFundsTx,
  buildMintStateTokenTx,
  buildSetIntendedStakeCredentialTx,
  buildWalletVoteTx,
  buildWalletPublishTx,
  buildSttSpendTx,
  getValidityWindow,
  buildWalletSpendTx,
  buildWalletWithdrawTx,
  signAndSubmitTx
} from "@/lib/mesh/transactions";

import {
  type BuildResult,
  type ConsolidateUtxosFormInput,
  type ConstrData,
  type SttSpendFormInput } from "@/lib/types/contracts";
import { mintConfirmationRunAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { ALLOWANCE_WITHDRAWAL_ACTION, BENEFICIARY_WITHDRAWAL_ACTION, MINT_CONFIRMATION_MAX_ATTEMPTS, MINT_PERFORMED_ACTION, RENEW_PROOF_OF_LIFE_ACTION, STREAMING_PAYMENT_PAYOUT_ACTION } from "@/components/user/workspace/constants";
import { cloneAssets, cloneStateForm, formatBuildError, hasFieldErrors, isSttFlowAction, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveOperatorActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveProofOfLifeOverrideTimestamp, resolveWalletWrapperSttInputRef, serializeRequiredConstrPreset, serializeTransfers, serializeWalletOutputs } from "@/components/user/workspace/helpers";

import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import { schedulePostSubmitRefresh } from "@/components/user/workspace/workspace-transaction-refresh";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceTransactions.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceTransactions", defaultMessages);

export function createWorkspaceTransactions(ctx: WorkspaceTransactionsCtx) {
  const {
    activeBuild,
    activeFieldErrors,
    activeInferredSttStateForm,
    activePaymentKeyHash,
    activeReadinessIssues,
    activeSubmit,
    activeWallet,
    activeWalletName,
    addSubmittedTransactionToActivity,
    effectiveSttAction,
    effectiveWalletAssetNameHex,
    isDemoWallet,
    jotaiStore,
    lockingContract,
    networkId,
    preview,
    previewMatchesSelectedAction,
    proposalCaptureRef,
    refreshLockedContractUtxos,
    refreshPermissionWalletSummaries,
    selectedAction,
    selectedDetectedToken,
    selectedDetectedTokenAssets,
    selectedDetectedTokenStateForm,
    setActiveSubmit,
    setBuildError,
    setBuildErrorDetails,
    setMintConfirmation,
    setMintedWalletName,
    setSubmitHash,
    streamingPaymentPayoutTransfers,
    submitHash,
    submitInFlightRef,
    watchMintCreationConfirmation,
    withBuildGuard,
    rememberRecipients,
    refreshWalletBalance
  } = ctx;
  const {
    config,
    consolidateAuthorityPath,
    consolidateSttAssets,
    consolidateSttInputHash,
    consolidateSttInputIndex,
    consolidateWalletInputs,
    consolidateWalletOutputs,
    lockFundsAssets,
    mintReference,
    mintStarterAssets,
    mintStateForm,
    voteJson,
    voteSttAssets,
    voteSttInputHash,
    voteSttInputIndex,
    voteSttStateForm,
    publishCertificateJson,
    publishSttAssets,
    publishSttInputHash,
    publishSttInputIndex,
    publishSttStateForm,
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
    walletOperatorPath,
    walletSpendInputHash,
    walletSpendInputIndex,
    walletSpendOutputs,
    walletSpendRedeemerPreset,
    withdrawAmount,
    withdrawRewardAddress,
    withdrawSttAssets,
    withdrawSttInputHash,
    withdrawSttInputIndex,
    withdrawSttStateForm
  } = resolveWorkspaceTransactionInputs(jotaiStore);
  const setSelectedSttAction = (update: SetStateAction<SttSpendActionMode>) => jotaiStore.set(selectedSttActionAtom, update);
  const setSttStateForm = (update: SetStateAction<StateFormState>) => jotaiStore.set(sttStateFormAtom, update);

  async function buildMintTx() {
    return withBuildGuard(
      "mint",
      async () => {
        const mintState = cloneStateForm(mintStateForm);
        const stateDatum = stateFormToDatum(mintState, MINT_PERFORMED_ACTION);
        const selectedReference = (() => {
          if (!mintReference.trim()) return undefined;

          const [txHash, indexText] = mintReference.split("#");
          if (!txHash || typeof indexText === "undefined") {
            throw new Error("Reference UTxO format must be txHash#outputIndex");
          }

          return {
            txHash,
            outputIndex: Number(indexText)
          };
        })();

        return buildMintStateTokenTx(activeWallet!, {
          starterAssets: cloneAssets(mintStarterAssets),
          stateDatum,
          selectedReferenceUtxo: selectedReference
        });
      },
      {
        starterFundingMode: "derived-wallet-address",
        starterFunds: cloneAssets(mintStarterAssets),
        mintReference,
        hasWalletPaymentKeyHash: Boolean(activePaymentKeyHash),
        adminUsers: countAdminUsersInStateForm(mintStateForm)
      }
    );
  }

  async function buildSttTx(
    mode:
      | "use"
      | "renew-proof-of-life"
      | "update-state"
      | "manage-streaming-payments"
      | "use-allowance"
      | "use-beneficiary"
      | "payout-streaming-payment"
  ) {
    return withBuildGuard(
      mode,
      async () => {
        // Build against a fresh validity window. The displayed payout quote was
        // computed from an earlier LOWER bound, so it is conservative as time
        // advances; the pure builder re-check below is the final exact cap.
        const validityWindowReferenceTimeMs = Date.now();
        let effectiveForm =
          mode === "update-state" || mode === "manage-streaming-payments"
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
          // an ADMIN (the only cadence-exempt cranker; whitepaper:
          // Settlement-cadence theorem).
          crankSignerKeyHash:
            mode === "payout-streaming-payment"
              ? activePaymentKeyHash ?? undefined
              : undefined,
          walletInputs: sttWalletInputs.map((entry) => ({ ...entry })),
          walletOutputs: effectiveWalletOutputs,
          extraTransfers: effectiveExtraTransfers
        };

        // Capture for "Save as approval request": only the operator paths
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

        return buildSttSpendTx(activeWallet!, config, mode, payload);
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

  async function buildLockFunds() {
    return withBuildGuard(
      "lock-funds",
      async () =>
        buildLockFundsTx(activeWallet!, config, {
          assets: cloneAssets(lockFundsAssets),
          inlineDatum: undefined,
          // Deposit to the wallet's canonical address: base address for a
          // staking wallet, enterprise (unchanged) otherwise.
          intendedStakeCredential:
            activeInferredSttStateForm.intendedStakeCredential as ConstrData
        }),
      {
        walletPolicyId: config.walletPolicyId,
        walletAssetNameHex: config.walletAssetNameHex,
        lockAddress: lockingContract.address,
        assetCount: lockFundsAssets.length
      }
    );
  }

  async function buildWalletSpend() {
    return withBuildGuard(
      "wallet-spend",
      async () =>
        buildWalletSpendTx(activeWallet!, config, {
          walletInputTxHash: walletSpendInputHash,
          walletInputOutputIndex: walletSpendInputIndex
            ? Number(walletSpendInputIndex)
            : undefined,
          redeemer: serializeRequiredConstrPreset(
            walletSpendRedeemerPreset,
            "Wallet spend redeemer"
          ),
          outputs: serializeTransfers(walletSpendOutputs)
        }),
      {
        walletInputTxHash: walletSpendInputHash,
        walletInputOutputIndex: walletSpendInputIndex,
        outputCount: walletSpendOutputs.length
      }
    );
  }

  async function buildWalletWithdraw() {
    const withdrawSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      withdrawSttInputHash,
      withdrawSttInputIndex
    );
    const withdrawSttOutIdx =
      withdrawSttRef.indexStr.trim() === "" ? undefined : Number(withdrawSttRef.indexStr);
    return withBuildGuard(
      "wallet-withdraw",
      async () =>
        buildWalletWithdrawTx(activeWallet!, config, {
          rewardAddress: withdrawRewardAddress,
          amountLovelace: withdrawAmount,
          sttInputTxHash: withdrawSttRef.txHash,
          sttInputOutputIndex: withdrawSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            cloneStateForm(withdrawSttStateForm),
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(withdrawSttAssets),
          authorityPath: walletOperatorPath
        }),
      {
        rewardAddress: withdrawRewardAddress,
        amountLovelace: withdrawAmount,
        sttInputTxHash: withdrawSttRef.txHash,
        sttInputOutputIndex: withdrawSttRef.indexStr
      }
    );
  }

  async function buildWalletPublish() {
    const publishSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      publishSttInputHash,
      publishSttInputIndex
    );
    const publishSttOutIdx =
      publishSttRef.indexStr.trim() === "" ? undefined : Number(publishSttRef.indexStr);
    const publishGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(publishSttStateForm);
    return withBuildGuard(
      "wallet-publish",
      async () =>
        buildWalletPublishTx(activeWallet!, config, {
          certificate: JSON.parse(publishCertificateJson),
          sttInputTxHash: publishSttRef.txHash,
          sttInputOutputIndex: publishSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            cloneStateForm(publishGovernanceStateForm),
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(publishSttAssets),
          authorityPath: walletOperatorPath
        }),
      {
        sttInputTxHash: publishSttRef.txHash,
        sttInputOutputIndex: publishSttRef.indexStr
      }
    );
  }

  async function buildSetIntendedStakeCredential() {
    const setCredSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      "",
      ""
    );
    const setCredSttOutIdx =
      setCredSttRef.indexStr.trim() === "" ? undefined : Number(setCredSttRef.indexStr);
    const walletPolicyId = config.walletPolicyId?.trim() ?? "";
    const walletAssetNameHex = effectiveWalletAssetNameHex;
    // The wallet delegates via its OWN multi-purpose script, so the stake
    // credential is the same parameterized script hash as its payment credential.
    const stakeCredentialData = resolveWalletStakeScriptCredentialData({
      sttPolicyId: walletPolicyId,
      sttAssetNameHex: walletAssetNameHex
    });
    const walletScriptHash = resolveWalletSpendScriptHash({
      sttPolicyId: walletPolicyId,
      sttAssetNameHex: walletAssetNameHex
    });
    const baseStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(activeInferredSttStateForm);
    const nextStateForm: StateFormState = {
      ...baseStateForm,
      intendedStakeCredential: stakeCredentialData
    };
    return withBuildGuard(
      "set-intended-stake-credential",
      async () =>
        buildSetIntendedStakeCredentialTx(activeWallet!, config, {
          sttInputTxHash: setCredSttRef.txHash,
          sttInputOutputIndex: setCredSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            nextStateForm,
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(selectedDetectedTokenAssets),
          authorityPath: walletOperatorPath,
          stakeCredential: { kind: "script", hashHex: walletScriptHash }
        }),
      {
        sttInputTxHash: setCredSttRef.txHash,
        sttInputOutputIndex: setCredSttRef.indexStr,
        stakeCredentialHash: walletScriptHash
      }
    );
  }

  async function buildWalletVote() {
    const voteSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      voteSttInputHash,
      voteSttInputIndex
    );
    const voteSttOutIdx =
      voteSttRef.indexStr.trim() === "" ? undefined : Number(voteSttRef.indexStr);
    const voteGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(voteSttStateForm);
    return withBuildGuard(
      "wallet-vote",
      async () =>
        buildWalletVoteTx(activeWallet!, config, {
          vote: JSON.parse(voteJson),
          sttInputTxHash: voteSttRef.txHash,
          sttInputOutputIndex: voteSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            cloneStateForm(voteGovernanceStateForm),
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(voteSttAssets),
          authorityPath: walletOperatorPath
        }),
      {
        sttInputTxHash: voteSttRef.txHash,
        sttInputOutputIndex: voteSttRef.indexStr
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

        return buildConsolidateUtxosTx(activeWallet!, config, payload);
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

  async function buildSelectedActionTx() {
    if (hasFieldErrors(activeFieldErrors)) {
      setBuildError(i18n("fixTheHighlightedFieldsBeforeContinuing"));
      setBuildErrorDetails(null);
      return null;
    }

    if (activeReadinessIssues.some((issue) => issue.blocking)) {
      setBuildError(i18n("finishTheSetupChecklistBeforeContinuing"));
      setBuildErrorDetails(null);
      return null;
    }

    if (selectedAction === "mint") {
      return buildMintTx();
    }

    if (selectedAction === "lock-funds") {
      return buildLockFunds();
    }

    if (selectedAction === "wallet-spend") {
      return buildWalletSpend();
    }

    if (selectedAction === "wallet-withdraw") {
      return buildWalletWithdraw();
    }

    if (selectedAction === "wallet-publish") {
      return buildWalletPublish();
    }

    if (selectedAction === "set-intended-stake-credential") {
      return buildSetIntendedStakeCredential();
    }

    if (selectedAction === "wallet-vote") {
      return buildWalletVote();
    }

    if (!isSttFlowAction(selectedAction)) {
      setBuildError(i18n("theSelectedActionIsNotWiredToA_ee5fb7"));
      setBuildErrorDetails(null);
      return null;
    }

    setSelectedSttAction(selectedAction);
    return buildSelectedSttActionTx();
  }

  async function submitTransactionPreview(
    transactionPreview: BuildResult,
    options: { allowExistingSubmitHash?: boolean; requireCurrentPreview?: boolean } = {}
  ) {
    const { allowExistingSubmitHash = false, requireCurrentPreview = true } = options;

    // Synchronous re-entry guard: blocks the second handler call when the
    // user double-clicks before React re-renders the button as disabled.
    if (submitInFlightRef.current) {
      return;
    }

    if (!activeWallet) {
      setBuildError(i18n("connectWalletFirst"));
      return;
    }

    if (isDemoWallet) {
      setBuildError(
        i18n("demoWalletCannotConfirmActionsConnectABrowser")
      );
      setBuildErrorDetails(null);
      return;
    }

    if (submitHash && !allowExistingSubmitHash) {
      setBuildError(i18n("thisActionWasAlreadyCompletedChangeSomethingBefore"));
      setBuildErrorDetails(null);
      return;
    }

    if (!transactionPreview.txHex) {
      setBuildError(i18n("theTransactionCouldNotBePreparedTryAgain"));
      setBuildErrorDetails(null);
      return;
    }

    if (
      requireCurrentPreview &&
      (!previewMatchesSelectedAction || preview?.txHex !== transactionPreview.txHex)
    ) {
      setBuildError(i18n("theTransactionDetailsAreStaleContinueAgainTo_34b074"));
      setBuildErrorDetails(null);
      return;
    }

    submitInFlightRef.current = true;
    setActiveSubmit(true);
    setBuildError(null);
    setBuildErrorDetails(null);

    if (selectedAction === "mint") {
      // Snapshot the name now, before the post-submit list refresh can bump the
      // live form value, so the celebration shows the name actually minted.
      setMintedWalletName(normalizeWalletName(mintStateForm.walletName));
      jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
      setMintConfirmation({
        txHash: "",
        phase: "submitting",
        attempts: 0,
        maxAttempts: MINT_CONFIRMATION_MAX_ATTEMPTS,
        updatedAt: Date.now()
      });
    }

    try {
      const txHash = await signAndSubmitTx(activeWallet, transactionPreview.txHex);
      setSubmitHash(txHash);
      void addSubmittedTransactionToActivity(txHash);
      if (
        selectedAction === "use" ||
        selectedAction === "use-allowance" ||
        selectedAction === "use-beneficiary"
      ) {
        rememberRecipients(sttExtraTransfers.map((transfer) => transfer.address));
        // Clear the payouts this transaction just sent. Leaving them staged made the
        // review rail keep describing the send in the future tense -- "You are sending
        // 5 ₳ to ..." -- over money that had already left the wallet, with Next step
        // still saying "Review the receipt and continue".
        jotaiStore.set(sttExtraTransfersAtom, []);
      }
      if (selectedAction === "lock-funds") {
        // Same reason: the receipt read "You are adding 10 ₳ to the selected wallet."
        // after the 10 ₳ had already been locked.
        jotaiStore.set(resetLockFundsFormAtom);
      }
      void refreshWalletBalance();
      void refreshLockedContractUtxos(lockingContract.address);
      if (selectedAction === "mint") {
        void watchMintCreationConfirmation(txHash);
      } else {
        void refreshPermissionWalletSummaries();
        // The immediate refresh above runs before the tx confirms; re-poll over
        // the next ~75s so the wallet updates itself once the tx lands.
        schedulePostSubmitRefresh(ctx);
      }
    } catch (error) {
      const parsed = formatBuildError(error, {
        action: "submit",
        wallet: activeWalletName,
        networkId,
        context: {
          previewAction: transactionPreview.preview.action,
          previewSummary: transactionPreview.preview.summary
        }
      });
      setBuildError(parsed.message);
      setBuildErrorDetails(parsed.details);
      if (selectedAction === "mint") {
        jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
        setMintConfirmation(null);
      }
      console.warn("[submit]", parsed.details);
    } finally {
      setActiveSubmit(false);
      submitInFlightRef.current = false;
    }
  }

  async function buildAndSubmitSelectedActionTx() {
    if (activeBuild === selectedAction || activeSubmit) {
      return;
    }

    const nextPreview = await buildSelectedActionTx();

    if (!nextPreview?.txHex) {
      return;
    }

    await submitTransactionPreview(nextPreview, {
      allowExistingSubmitHash: true,
      requireCurrentPreview: false
    });
  }

  return {
    buildMintTx,
    buildSttTx,
    buildLockFunds,
    buildWalletSpend,
    buildWalletWithdraw,
    buildWalletPublish,
    buildSetIntendedStakeCredential,
    buildWalletVote,
    buildConsolidateUtxos,
    buildSelectedSttActionTx,
    buildSelectedActionTx,
    submitTransactionPreview,
    buildAndSubmitSelectedActionTx
  };
}
