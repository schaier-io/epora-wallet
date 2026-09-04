"use client";
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { type SetStateAction } from "react";
// Only the atoms WRITTEN here remain imported; the ~40 atoms the builders READ
// are gathered by resolveWorkspaceTransactionInputs (see below).
import { selectedSttActionAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { buildDiagnosticIdAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { resolveWorkspaceTransactionInputs } from "@/components/user/workspace/workspace-transaction-inputs";
import { createWorkspaceTransactionSubmit } from "@/components/user/workspace/workspace-transaction-submit";
import { createProposalCaptureWriter } from "@/components/user/workspace/workspace-proposal-capture";

import { applyProofOfLifeOverrideToStateForm, countAdminUsersInStateForm, stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
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
  buildWalletWithdrawTx
} from "@/lib/mesh/transactions";

import {
  type AuthorityPath,
  type ConsolidateAuthorityPath,
  type ConsolidateUtxosFormInput,
  type ConstrData,
  type OperatorAuthorityPath,
  type SetIntendedStakeCredentialFormInput,
  type SttSpendFormInput,
  type WalletPublishFormInput,
  type WalletVoteFormInput,
  type WalletWithdrawFormInput } from "@/lib/types/contracts";
import { ALLOWANCE_WITHDRAWAL_ACTION, BENEFICIARY_WITHDRAWAL_ACTION, MINT_PERFORMED_ACTION, RENEW_PROOF_OF_LIFE_ACTION, STREAMING_PAYMENT_PAYOUT_ACTION } from "@/components/user/workspace/constants";
import { cloneAssets, cloneStateForm, hasFieldErrors, isSttFlowAction, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveOperatorActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveProofOfLifeOverrideTimestamp, resolveWalletWrapperSttInputRef, serializeRequiredConstrPreset, serializeTransfers, serializeWalletOutputs } from "@/components/user/workspace/helpers";

import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
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
    setBuildErrorExpected,
    setMintConfirmation,
    setMintedWalletName,
    setSubmitHash,
    streamingPaymentPayout,
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

  const captureProposal = createProposalCaptureWriter({
    activePaymentKeyHash,
    proposalCaptureRef,
    stateForm: activeInferredSttStateForm,
    walletAssetNameHex: effectiveWalletAssetNameHex,
    walletPolicyId: config.walletPolicyId
  });

  // The sign-and-send path lives in its own module (workspace-transaction-submit.ts,
  // split by concern under the repo's file cap); this file owns the build half.
  const { submitTransactionPreview } = createWorkspaceTransactionSubmit({
    activeWallet,
    activeWalletName,
    isDemoWallet,
    networkId,
    jotaiStore,
    selectedAction,
    preview,
    previewMatchesSelectedAction,
    submitHash,
    submitInFlightRef,
    setActiveSubmit,
    setBuildError,
    setBuildErrorExpected,
    setSubmitHash,
    setMintConfirmation,
    setMintedWalletName,
    addSubmittedTransactionToActivity,
    rememberRecipients,
    refreshDetectedTokens: ctx.refreshDetectedTokens,
    refreshLockedContractUtxos,
    refreshPermissionWalletSummaries,
    refreshWalletBalance,
    lockingContract,
    postSubmitRefreshTimersRef: ctx.postSubmitRefreshTimersRef,
    watchMintCreationConfirmation,
    mintStateForm,
    sttExtraTransfers
  });

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
      | "payout-streaming-payment",
    authorityPathOverride?: OperatorAuthorityPath
  ) {
    const effectiveAuthorityPath = authorityPathOverride ?? sttAuthorityPath;
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
          mode === "update-state" || mode === "manage-streaming-payments"
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
        if (effectiveAuthorityPath === "admin" || effectiveAuthorityPath === "multisig") {
          captureProposal(mode, effectiveAuthorityPath, {
            builder: "stt-spend",
            mode,
            config: { ...config },
            input: payload
          });
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

  async function buildWalletWithdraw(authorityPathOverride?: OperatorAuthorityPath) {
    const effectiveAuthorityPath = authorityPathOverride ?? walletOperatorPath;
    const withdrawSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      withdrawSttInputHash,
      withdrawSttInputIndex
    );
    const withdrawSttOutIdx =
      withdrawSttRef.indexStr.trim() === "" ? undefined : Number(withdrawSttRef.indexStr);
    const input: WalletWithdrawFormInput = {
      rewardAddress: withdrawRewardAddress,
      amountLovelace: withdrawAmount,
      sttInputTxHash: withdrawSttRef.txHash,
      sttInputOutputIndex: withdrawSttOutIdx,
      sttOutputDatum: stateFormToDatum(
        cloneStateForm(withdrawSttStateForm),
        resolveOperatorActionAlternative(effectiveAuthorityPath)
      ),
      sttOutputAssets: cloneAssets(withdrawSttAssets),
      authorityPath: effectiveAuthorityPath
    };
    return withBuildGuard(
      "wallet-withdraw",
      async () => {
        captureProposal("wallet-withdraw", effectiveAuthorityPath, {
          builder: "wallet-withdraw",
          config: { ...config },
          input
        });
        return buildWalletWithdrawTx(activeWallet!, config, input);
      },
      {
        rewardAddress: withdrawRewardAddress,
        amountLovelace: withdrawAmount,
        sttInputTxHash: withdrawSttRef.txHash,
        sttInputOutputIndex: withdrawSttRef.indexStr
      }
    );
  }

  async function buildWalletPublish(authorityPathOverride?: OperatorAuthorityPath) {
    const effectiveAuthorityPath = authorityPathOverride ?? walletOperatorPath;
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
    const input: WalletPublishFormInput = {
      certificate: JSON.parse(publishCertificateJson),
      sttInputTxHash: publishSttRef.txHash,
      sttInputOutputIndex: publishSttOutIdx,
      sttOutputDatum: stateFormToDatum(
        cloneStateForm(publishGovernanceStateForm),
        resolveOperatorActionAlternative(effectiveAuthorityPath)
      ),
      sttOutputAssets: cloneAssets(publishSttAssets),
      authorityPath: effectiveAuthorityPath
    };
    return withBuildGuard(
      "wallet-publish",
      async () => {
        captureProposal("wallet-publish", effectiveAuthorityPath, {
          builder: "wallet-publish",
          config: { ...config },
          input
        });
        return buildWalletPublishTx(activeWallet!, config, input);
      },
      {
        sttInputTxHash: publishSttRef.txHash,
        sttInputOutputIndex: publishSttRef.indexStr
      }
    );
  }

  async function buildSetIntendedStakeCredential(
    authorityPathOverride?: OperatorAuthorityPath
  ) {
    const effectiveAuthorityPath = authorityPathOverride ?? walletOperatorPath;
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
    const input: SetIntendedStakeCredentialFormInput = {
      sttInputTxHash: setCredSttRef.txHash,
      sttInputOutputIndex: setCredSttOutIdx,
      sttOutputDatum: stateFormToDatum(
        nextStateForm,
        resolveOperatorActionAlternative(effectiveAuthorityPath)
      ),
      sttOutputAssets: cloneAssets(selectedDetectedTokenAssets),
      authorityPath: effectiveAuthorityPath,
      stakeCredential: { kind: "script", hashHex: walletScriptHash }
    };
    return withBuildGuard(
      "set-intended-stake-credential",
      async () => {
        captureProposal("set-intended-stake-credential", effectiveAuthorityPath, {
          builder: "set-intended-stake-credential",
          config: { ...config },
          input
        });
        return buildSetIntendedStakeCredentialTx(activeWallet!, config, input);
      },
      {
        sttInputTxHash: setCredSttRef.txHash,
        sttInputOutputIndex: setCredSttRef.indexStr,
        stakeCredentialHash: walletScriptHash
      }
    );
  }

  async function buildWalletVote(authorityPathOverride?: OperatorAuthorityPath) {
    const effectiveAuthorityPath = authorityPathOverride ?? walletOperatorPath;
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
    const input: WalletVoteFormInput = {
      vote: JSON.parse(voteJson),
      sttInputTxHash: voteSttRef.txHash,
      sttInputOutputIndex: voteSttOutIdx,
      sttOutputDatum: stateFormToDatum(
        cloneStateForm(voteGovernanceStateForm),
        resolveOperatorActionAlternative(effectiveAuthorityPath)
      ),
      sttOutputAssets: cloneAssets(voteSttAssets),
      authorityPath: effectiveAuthorityPath
    };
    return withBuildGuard(
      "wallet-vote",
      async () => {
        captureProposal("wallet-vote", effectiveAuthorityPath, {
          builder: "wallet-vote",
          config: { ...config },
          input
        });
        return buildWalletVoteTx(activeWallet!, config, input);
      },
      {
        sttInputTxHash: voteSttRef.txHash,
        sttInputOutputIndex: voteSttRef.indexStr
      }
    );
  }

  async function buildConsolidateUtxos(authorityPathOverride?: ConsolidateAuthorityPath) {
    const effectiveAuthorityPath = authorityPathOverride ?? consolidateAuthorityPath;
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
            resolveConsolidateActionAlternative(effectiveAuthorityPath)
          ),
          outputAssets: cloneAssets(consolidateSttAssets),
          authorityPath: effectiveAuthorityPath,
          walletInputs: consolidateWalletInputs.map((entry) => ({ ...entry })),
          walletOutputs: serializeWalletOutputs(consolidateWalletOutputs)
        };

        if (effectiveAuthorityPath === "admin" || effectiveAuthorityPath === "multisig") {
          captureProposal("consolidate-utxo", effectiveAuthorityPath, {
            builder: "consolidate-utxo",
            config: { ...config },
            input: payload
          });
        }
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

  async function buildSelectedSttActionTx(authorityPathOverride?: AuthorityPath) {
    if (effectiveSttAction === "consolidate-utxo") {
      return buildConsolidateUtxos(
        authorityPathOverride as ConsolidateAuthorityPath | undefined
      );
    }

    return buildSttTx(
      effectiveSttAction,
      authorityPathOverride as OperatorAuthorityPath | undefined
    );
  }

  async function buildSelectedActionTx(authorityPathOverride?: AuthorityPath) {
    // Both guarded exits below show a fresh expected error; the diagnostic id of
    // an earlier unexpected failure must not survive next to it.
    jotaiStore.set(buildDiagnosticIdAtom, null);
    if (hasFieldErrors(activeFieldErrors)) {
      setBuildError(i18n("fixTheHighlightedFieldsBeforeContinuing"));
      setBuildErrorExpected(true);
      return null;
    }

    if (activeReadinessIssues.some((issue) => issue.blocking)) {
      setBuildError(i18n("finishTheSetupChecklistBeforeContinuing"));
      setBuildErrorExpected(true);
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
      return buildWalletWithdraw(authorityPathOverride as OperatorAuthorityPath | undefined);
    }

    if (selectedAction === "wallet-publish") {
      return buildWalletPublish(authorityPathOverride as OperatorAuthorityPath | undefined);
    }

    if (selectedAction === "set-intended-stake-credential") {
      return buildSetIntendedStakeCredential(
        authorityPathOverride as OperatorAuthorityPath | undefined
      );
    }

    if (selectedAction === "wallet-vote") {
      return buildWalletVote(authorityPathOverride as OperatorAuthorityPath | undefined);
    }

    if (!isSttFlowAction(selectedAction)) {
      setBuildError(i18n("theSelectedActionIsNotWiredToA_ee5fb7"));
      setBuildErrorExpected(true);
      return null;
    }

    setSelectedSttAction(selectedAction);
    return buildSelectedSttActionTx(authorityPathOverride);
  }

  async function buildAndSubmitSelectedActionTx(authorityPathOverride?: AuthorityPath) {
    if (activeBuild === selectedAction || activeSubmit) {
      return;
    }

    // The build runs several network round trips and no editor is locked meanwhile.
    // Read the draft straight from the store on both sides so an edit made during the
    // build is refused instead of being signed under the old preview.
    const draftBeforeBuild = JSON.stringify(resolveWorkspaceTransactionInputs(jotaiStore));
    const nextPreview = await buildSelectedActionTx(authorityPathOverride);

    if (!nextPreview?.txHex) {
      return;
    }

    if (JSON.stringify(resolveWorkspaceTransactionInputs(jotaiStore)) !== draftBeforeBuild) {
      setBuildError(i18n("theTransactionDetailsAreStaleContinueAgainTo_34b074"));
      setBuildErrorExpected(true);
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
