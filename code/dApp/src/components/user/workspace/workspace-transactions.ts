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
import { createWorkspaceSttBuilder } from "./workspace-stt-builder";

import { countAdminUsersInStateForm, stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import {
  resolveWalletSpendScriptHash,
  resolveWalletStakeScriptCredentialData
} from "@/lib/contracts/blueprint";

import {
  buildBeneficiaryPreparationTx,
  buildConsolidateUtxosTx,
  buildLockFundsTx,
  buildMintStateTokenTx,
  buildSetIntendedStakeCredentialTx,
  buildWalletVoteTx,
  buildWalletPublishTx,
  buildWalletWithdrawTx
} from "@/lib/mesh/transactions";

import {
  type AuthorityPath,
  type ConsolidateAuthorityPath,
  type ConsolidateUtxosFormInput,
  type ConstrData,
  type OperatorAuthorityPath,
  type SetIntendedStakeCredentialFormInput,
  type WalletPublishFormInput,
  type WalletVoteFormInput,
  type WalletWithdrawFormInput } from "@/lib/types/contracts";
import { MINT_PERFORMED_ACTION } from "@/components/user/workspace/constants";
import { cloneAssets, cloneStateForm, hasFieldErrors, isSttFlowAction, resolveConsolidateActionAlternative, resolveOperatorActionAlternative, resolveWalletWrapperSttInputRef, safeStringify, serializeWalletOutputs } from "@/components/user/workspace/helpers";

import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import { multisigDraftSignerKeyHashes } from "@/components/user/workspace/helpers/multisig-draft-signers";
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
    beneficiaryPreparationActive, beneficiaryPreparationPoolAssets,
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
    sttExtraTransfers,
    walletOperatorPath,
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
  const requiredSignerKeyHashesFor = (authorityPath: AuthorityPath) =>
    authorityPath === "multisig"
      ? multisigDraftSignerKeyHashes(activeInferredSttStateForm, activePaymentKeyHash)
      : undefined;

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
          sttSpendReference: config.sttSpendReference,
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

  const { buildSttTx } = createWorkspaceSttBuilder(ctx, captureProposal, requiredSignerKeyHashesFor);

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
      authorityPath: effectiveAuthorityPath,
      requiredSignerKeyHashes: requiredSignerKeyHashesFor(effectiveAuthorityPath)
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
      authorityPath: effectiveAuthorityPath,
      requiredSignerKeyHashes: requiredSignerKeyHashesFor(effectiveAuthorityPath)
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
      stakeCredential: { kind: "script", hashHex: walletScriptHash },
      requiredSignerKeyHashes: requiredSignerKeyHashesFor(effectiveAuthorityPath)
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
      authorityPath: effectiveAuthorityPath,
      requiredSignerKeyHashes: requiredSignerKeyHashesFor(effectiveAuthorityPath)
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
    if (beneficiaryPreparationActive) {
      proposalCaptureRef.current = null;
      return withBuildGuard("consolidate-utxo", () => buildBeneficiaryPreparationTx(activeWallet!, config, {
        sttInputTxHash: consolidateSttInputHash,
        sttInputOutputIndex: consolidateSttInputIndex ? Number(consolidateSttInputIndex) : undefined,
        walletInputs: consolidateWalletInputs.map(ref => ({ ...ref })),
        beneficiarySignerKeyHash: activePaymentKeyHash ?? "",
        poolAssets: cloneAssets(beneficiaryPreparationPoolAssets),
        expectedStateDatum: stateFormToDatum(cloneStateForm(activeInferredSttStateForm))
      }));
    }
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
          requiredSignerKeyHashes: requiredSignerKeyHashesFor(effectiveAuthorityPath),
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
    const draftBeforeBuild = safeStringify(resolveWorkspaceTransactionInputs(jotaiStore));
    const nextPreview = await buildSelectedActionTx(authorityPathOverride);

    if (!nextPreview?.txHex) {
      return;
    }

    if (safeStringify(resolveWorkspaceTransactionInputs(jotaiStore)) !== draftBeforeBuild) {
      setBuildError(i18n("theTransactionDetailsAreStaleContinueAgainTo_34b074"));
      setBuildErrorExpected(true);
      return;
    }

    // A permanent exit needs a separate click after its built warnings are visible.
    if ((selectedAction === "consolidate-utxo" && beneficiaryPreparationActive) || selectedAction === "exit-beneficiary" || selectedAction === "stop-beneficiary-stream" || selectedAction === "distribute-beneficiaries") return;

    await submitTransactionPreview(nextPreview, {
      allowExistingSubmitHash: true,
      requireCurrentPreview: false
    });
  }

  return {
    buildMintTx,
    buildSttTx,
    buildLockFunds,
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
