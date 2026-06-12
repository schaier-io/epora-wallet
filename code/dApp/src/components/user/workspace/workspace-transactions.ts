"use client";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { type SetStateAction } from "react";
import { consolidateSttAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { mintReferenceAtom, mintStarterAssetsAtom, mintStateFormAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { proposalJsonAtom, proposalSttAssetsAtom, proposalSttInputHashAtom, proposalSttInputIndexAtom, proposalSttStateFormAtom } from "@/components/user/workspace/atoms/forms/propose-form.atoms";
import { publishCertificateJsonAtom, publishSttAssetsAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { consolidateAuthorityPathAtom, selectedSttActionAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputOutputIndexAtom, sttInputTxHashAtom, sttOutputAssetsAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttStateFormAtom, sttWalletInputsAtom, sttWalletOutputsAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { walletSpendInputHashAtom, walletSpendInputIndexAtom, walletSpendOutputsAtom, walletSpendRedeemerPresetAtom } from "@/components/user/workspace/atoms/forms/wallet-spend-form.atoms";
import { withdrawAmountAtom, withdrawRewardAddressAtom, withdrawSttAssetsAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";

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
  buildWalletProposeTx,
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
import { cloneAssets, cloneStateForm, formatBuildError, hasFieldErrors, isSttFlowAction, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveOperatorActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveWalletWrapperSttInputRef, serializeRequiredConstrPreset, serializeTransfers, serializeWalletOutputs } from "@/components/user/workspace/helpers";

import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

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
    postSubmitRefreshTimersRef,
    preview,
    previewMatchesSelectedAction,
    proposalCaptureRef,
    refreshDetectedTokens,
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
  const config = jotaiStore.get(configAtom);
  const consolidateAuthorityPath = jotaiStore.get(consolidateAuthorityPathAtom);
  const consolidateSttAssets = jotaiStore.get(consolidateSttAssetsAtom);
  const consolidateSttInputHash = jotaiStore.get(consolidateSttInputHashAtom);
  const consolidateSttInputIndex = jotaiStore.get(consolidateSttInputIndexAtom);
  const consolidateWalletInputs = jotaiStore.get(consolidateWalletInputsAtom);
  const consolidateWalletOutputs = jotaiStore.get(consolidateWalletOutputsAtom);
  const lockFundsAssets = jotaiStore.get(lockFundsAssetsAtom);
  const mintReference = jotaiStore.get(mintReferenceAtom);
  const mintStarterAssets = jotaiStore.get(mintStarterAssetsAtom);
  const mintStateForm = jotaiStore.get(mintStateFormAtom);
  const proposalJson = jotaiStore.get(proposalJsonAtom);
  const proposalSttAssets = jotaiStore.get(proposalSttAssetsAtom);
  const proposalSttInputHash = jotaiStore.get(proposalSttInputHashAtom);
  const proposalSttInputIndex = jotaiStore.get(proposalSttInputIndexAtom);
  const proposalSttStateForm = jotaiStore.get(proposalSttStateFormAtom);
  const publishCertificateJson = jotaiStore.get(publishCertificateJsonAtom);
  const publishSttAssets = jotaiStore.get(publishSttAssetsAtom);
  const publishSttInputHash = jotaiStore.get(publishSttInputHashAtom);
  const publishSttInputIndex = jotaiStore.get(publishSttInputIndexAtom);
  const publishSttStateForm = jotaiStore.get(publishSttStateFormAtom);
  const sttAuthorityPath = jotaiStore.get(sttAuthorityPathAtom);
  const sttExtraTransfers = jotaiStore.get(sttExtraTransfersAtom);
  const sttInputOutputIndex = jotaiStore.get(sttInputOutputIndexAtom);
  const sttInputTxHash = jotaiStore.get(sttInputTxHashAtom);
  const sttOutputAssets = jotaiStore.get(sttOutputAssetsAtom);
  const sttProofOfLifeOverrideMode = jotaiStore.get(sttProofOfLifeOverrideModeAtom);
  const sttProofOfLifeSpecificDateTime = jotaiStore.get(sttProofOfLifeSpecificDateTimeAtom);
  const sttStateForm = jotaiStore.get(sttStateFormAtom);
  const sttWalletInputs = jotaiStore.get(sttWalletInputsAtom);
  const sttWalletOutputs = jotaiStore.get(sttWalletOutputsAtom);
  const walletOperatorPath = jotaiStore.get(walletOperatorPathAtom);
  const walletSpendInputHash = jotaiStore.get(walletSpendInputHashAtom);
  const walletSpendInputIndex = jotaiStore.get(walletSpendInputIndexAtom);
  const walletSpendOutputs = jotaiStore.get(walletSpendOutputsAtom);
  const walletSpendRedeemerPreset = jotaiStore.get(walletSpendRedeemerPresetAtom);
  const withdrawAmount = jotaiStore.get(withdrawAmountAtom);
  const withdrawRewardAddress = jotaiStore.get(withdrawRewardAddressAtom);
  const withdrawSttAssets = jotaiStore.get(withdrawSttAssetsAtom);
  const withdrawSttInputHash = jotaiStore.get(withdrawSttInputHashAtom);
  const withdrawSttInputIndex = jotaiStore.get(withdrawSttInputIndexAtom);
  const withdrawSttStateForm = jotaiStore.get(withdrawSttStateFormAtom);
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
          // Deposit to the wallet's canonical address — base address for a
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

  async function buildWalletPropose() {
    const proposeSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      proposalSttInputHash,
      proposalSttInputIndex
    );
    const proposeSttOutIdx =
      proposeSttRef.indexStr.trim() === "" ? undefined : Number(proposeSttRef.indexStr);
    const proposeGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(proposalSttStateForm);
    return withBuildGuard(
      "wallet-propose",
      async () =>
        buildWalletProposeTx(activeWallet!, config, {
          proposal: JSON.parse(proposalJson),
          sttInputTxHash: proposeSttRef.txHash,
          sttInputOutputIndex: proposeSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            cloneStateForm(proposeGovernanceStateForm),
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(proposalSttAssets),
          authorityPath: walletOperatorPath
        }),
      {
        sttInputTxHash: proposeSttRef.txHash,
        sttInputOutputIndex: proposeSttRef.indexStr
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
      setBuildError("Fix the highlighted fields before continuing.");
      setBuildErrorDetails(null);
      return null;
    }

    if (activeReadinessIssues.some((issue) => issue.blocking)) {
      setBuildError("Finish the setup checklist before continuing.");
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

    if (selectedAction === "wallet-propose") {
      return buildWalletPropose();
    }

    if (!isSttFlowAction(selectedAction)) {
      setBuildError("The selected action is not wired to a builder yet.");
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
      setBuildError("Connect wallet first.");
      return;
    }

    if (isDemoWallet) {
      setBuildError(
        "Demo wallet cannot confirm actions. Connect a browser wallet to continue."
      );
      setBuildErrorDetails(null);
      return;
    }

    if (submitHash && !allowExistingSubmitHash) {
      setBuildError("This action was already completed. Change something before trying again.");
      setBuildErrorDetails(null);
      return;
    }

    if (!transactionPreview.txHex) {
      setBuildError("The transaction could not be prepared. Try again.");
      setBuildErrorDetails(null);
      return;
    }

    if (
      requireCurrentPreview &&
      (!previewMatchesSelectedAction || preview?.txHex !== transactionPreview.txHex)
    ) {
      setBuildError("The transaction details are stale. Continue again to refresh them.");
      setBuildErrorDetails(null);
      return;
    }

    submitInFlightRef.current = true;
    setActiveSubmit(true);
    setBuildError(null);
    setBuildErrorDetails(null);

    if (selectedAction === "mint") {
      // Snapshot the name now — before the post-submit list refresh can bump the
      // live form value — so the celebration shows the name actually minted.
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
      }
      void refreshWalletBalance();
      void refreshLockedContractUtxos(lockingContract.address);
      if (selectedAction === "mint") {
        void watchMintCreationConfirmation(txHash);
      } else {
        void refreshPermissionWalletSummaries();
        // The refresh above runs before the tx confirms, so it still reads the
        // pre-submit balance/UTxOs. Re-poll over the next ~75s so the wallet
        // updates itself once the tx lands — no manual Refresh needed.
        postSubmitRefreshTimersRef.current.forEach((id) => window.clearTimeout(id));
        postSubmitRefreshTimersRef.current = [12000, 30000, 50000, 75000].map((delay) =>
          window.setTimeout(() => {
            void refreshLockedContractUtxos(lockingContract.address);
            void refreshWalletBalance();
            void refreshPermissionWalletSummaries();
            // Re-detect the STT state so datum-derived display (wallet name,
            // owners, backups, timer) refreshes after a state-changing admin
            // update — keepSelection avoids flashing the wallet during the gap.
            void refreshDetectedTokens({ keepSelection: true });
          }, delay)
        );
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
    buildWalletPropose,
    buildConsolidateUtxos,
    buildSelectedSttActionTx,
    buildSelectedActionTx,
    submitTransactionPreview,
    buildAndSubmitSelectedActionTx
  };
}
