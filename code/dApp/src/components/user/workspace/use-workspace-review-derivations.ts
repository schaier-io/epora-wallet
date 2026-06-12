"use client";
import { sharedSttReferenceStoreAtom, sharedSttReferenceStoreLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";
import { consolidateSttInputHashAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { mintStarterAssetsAtom, mintStateFormAtom, mintZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { proposalJsonAtom, proposalSttInputHashAtom, proposalSttInputIndexAtom } from "@/components/user/workspace/atoms/forms/propose-form.atoms";
import { publishCertificateJsonAtom, publishSttInputHashAtom, publishSttInputIndexAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { consolidateAuthorityPathAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputTxHashAtom, sttStateFormAtom, sttWalletInputsAtom, sttWalletOutputsAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { walletSpendInputHashAtom, walletSpendOutputsAtom } from "@/components/user/workspace/atoms/forms/wallet-spend-form.atoms";
import { withdrawAmountAtom, withdrawRewardAddressAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";

import { useMemo } from "react";

import type { GuidedActionDraftContext } from "@/components/user/guided-action-adapters";
import type {
  FieldErrors,
  SetupState,
  UserActionKind
} from "@/components/user/flow-types";

import { useUserFlowState } from "@/components/user/use-user-flow-state";

import {
  countAdminUsersInStateForm,
  type StateFormState
} from "@/lib/contracts/state-form";

import {
  type DetectedSttToken
} from "@/lib/mesh/detection";

import {
  type BuildResult,
  type PayoutTransfer } from "@/lib/types/contracts";
import { type BrowserWallet } from "@meshsdk/core";
import { type AllowancePreviewResult } from "@/components/user/workspace/workspace-allowance-preview";

import { type computeActionSignature } from "@/components/user/workspace/workspace-action-signature";
import { computeReviewReceipt, type ReviewReceipt } from "@/components/user/workspace/workspace-review-receipt";
import { computeSelectedPathLabel, computeMintSetupSteps } from "@/components/user/workspace/workspace-guided-derivations";
import { computeDraftContext } from "@/components/user/workspace/workspace-draft-context";
import { type SetupProgressStep } from "@/components/user/workspace/types";

export interface WorkspaceReviewDerivationsInputs {
  actionFieldErrorsMap: Record<UserActionKind, FieldErrors>;
  activeWallet: BrowserWallet | null;
  autoMintStateForm: StateFormState;
  buildActionSignature: (action: UserActionKind) => ReturnType<typeof computeActionSignature>;
  lastActionLabel: string;
  lockingContract: { address: string | null };
  networkId: number | null;
  preview: BuildResult | null;
  previewSignature: string | null;
  selectedAction: UserActionKind;
  selectedDetectedToken: DetectedSttToken | null;
  selectedDetectedTokenLabel: string | null;
  setupState: SetupState;
  streamingPaymentPayoutTransfers: PayoutTransfer[];
  useAllowancePreview: AllowancePreviewResult;
  walletReady: boolean;
  wizardSelectedAction: UserActionKind | null;
}

export function useWorkspaceReviewDerivations(inputs: WorkspaceReviewDerivationsInputs) {
  const {
    actionFieldErrorsMap,
    activeWallet,
    autoMintStateForm,
    buildActionSignature,
    lastActionLabel,
    lockingContract,
    networkId,
    preview,
    previewSignature,
    selectedAction,
    selectedDetectedToken,
    selectedDetectedTokenLabel,
    setupState,
    streamingPaymentPayoutTransfers,
    useAllowancePreview,
    walletReady,
    wizardSelectedAction
  } = inputs;
  const sharedSttReferenceStore = useAtomValue(sharedSttReferenceStoreAtom);
  const sharedSttReferenceStoreLoading = useAtomValue(sharedSttReferenceStoreLoadingAtom);
  const consolidateAuthorityPath = useAtomValue(consolidateAuthorityPathAtom);
  const consolidateSttInputHash = useAtomValue(consolidateSttInputHashAtom);
  const consolidateWalletInputs = useAtomValue(consolidateWalletInputsAtom);
  const consolidateWalletOutputs = useAtomValue(consolidateWalletOutputsAtom);
  const lockFundsAssets = useAtomValue(lockFundsAssetsAtom);
  const mintStarterAssets = useAtomValue(mintStarterAssetsAtom);
  const mintStateForm = useAtomValue(mintStateFormAtom);
  const mintZeroAdminConfirmed = useAtomValue(mintZeroAdminConfirmedAtom);
  const proposalJson = useAtomValue(proposalJsonAtom);
  const proposalSttInputHash = useAtomValue(proposalSttInputHashAtom);
  const proposalSttInputIndex = useAtomValue(proposalSttInputIndexAtom);
  const publishCertificateJson = useAtomValue(publishCertificateJsonAtom);
  const publishSttInputHash = useAtomValue(publishSttInputHashAtom);
  const publishSttInputIndex = useAtomValue(publishSttInputIndexAtom);
  const sttAuthorityPath = useAtomValue(sttAuthorityPathAtom);
  const sttExtraTransfers = useAtomValue(sttExtraTransfersAtom);
  const sttInputTxHash = useAtomValue(sttInputTxHashAtom);
  const sttStateForm = useAtomValue(sttStateFormAtom);
  const sttWalletInputs = useAtomValue(sttWalletInputsAtom);
  const sttWalletOutputs = useAtomValue(sttWalletOutputsAtom);
  const walletOperatorPath = useAtomValue(walletOperatorPathAtom);
  const walletSpendInputHash = useAtomValue(walletSpendInputHashAtom);
  const walletSpendOutputs = useAtomValue(walletSpendOutputsAtom);
  const withdrawAmount = useAtomValue(withdrawAmountAtom);
  const withdrawRewardAddress = useAtomValue(withdrawRewardAddressAtom);
  const withdrawSttInputHash = useAtomValue(withdrawSttInputHashAtom);
  const withdrawSttInputIndex = useAtomValue(withdrawSttInputIndexAtom);

  const draftContext = useMemo<Omit<GuidedActionDraftContext, "actionReadinessMap">>(
    () =>
      computeDraftContext({
        consolidateAuthorityPath,
        consolidateSttInputHash,
        consolidateWalletInputs,
        consolidateWalletOutputs,
        lockFundsAssets,
        mintStarterAssets,
        mintStateForm,
        proposalJson,
        proposalSttInputHash,
        proposalSttInputIndex,
        publishCertificateJson,
        publishSttInputHash,
        publishSttInputIndex,
        sttAuthorityPath,
        sttExtraTransfers,
        sttInputTxHash,
        sttWalletInputs,
        sttWalletOutputs,
        walletOperatorPath,
        walletSpendInputHash,
        walletSpendOutputs,
        withdrawAmount,
        withdrawRewardAddress,
        withdrawSttInputHash,
        withdrawSttInputIndex,
        autoMintStateForm,
        selectedDetectedToken,
        streamingPaymentPayoutTransfers,
        useAllowancePreview
      }),
    [
      consolidateAuthorityPath,
      consolidateSttInputHash,
      consolidateWalletInputs,
      consolidateWalletOutputs,
      lockFundsAssets,
      mintStarterAssets,
      mintStateForm,
      proposalJson,
      proposalSttInputHash,
      proposalSttInputIndex,
      publishCertificateJson,
      publishSttInputHash,
      publishSttInputIndex,
      sttAuthorityPath,
      sttExtraTransfers,
      sttInputTxHash,
      sttWalletInputs,
      sttWalletOutputs,
      walletOperatorPath,
      walletSpendInputHash,
      walletSpendOutputs,
      withdrawAmount,
      withdrawRewardAddress,
      withdrawSttInputHash,
      withdrawSttInputIndex,
      autoMintStateForm,
      selectedDetectedToken,
      streamingPaymentPayoutTransfers,
      useAllowancePreview
    ]
  );

  const {
    actionDrafts,
    activeActionDraft,
    activeFieldErrors,
    activeReadinessIssues,
    activeActionDefinition,
    previewMatchesSelectedAction,
    lastActionDisplayLabel,
    primaryActionIssue
  } = useUserFlowState({
    setupState,
    actionFieldErrorsMap,
    selectedAction,
    preview,
    previewSignature,
    lastActionLabel,
    getBuildActionSignature: buildActionSignature,
    draftContext
  });
  const selectedPathLabel = useMemo<string | null>(
    () =>
      computeSelectedPathLabel({
        sttAuthorityPath,
        consolidateAuthorityPath,
        walletOperatorPath,
        wizardSelectedAction
      }),
    [
      consolidateAuthorityPath,
      sttAuthorityPath,
      walletOperatorPath,
      wizardSelectedAction
    ]
  );
  const mintOwnerCount = countAdminUsersInStateForm(mintStateForm);
  const mintHasOwnerChoice = mintOwnerCount > 0 || mintZeroAdminConfirmed;
  const sharedReferenceReady = sharedSttReferenceStore?.status === "ready";
  const showSharedReferenceSetup =
    sharedSttReferenceStoreLoading || !sharedReferenceReady;
  const mintSetupSteps = useMemo<SetupProgressStep[]>(
    () =>
      computeMintSetupSteps({
        activeWallet,
        mintHasOwnerChoice,
        networkId,
        preview,
        previewMatchesSelectedAction,
        selectedAction,
        sharedReferenceReady,
        sharedSttReferenceStoreLoading,
        showSharedReferenceSetup,
        walletReady
      }),
    [
      activeWallet,
      mintHasOwnerChoice,
      networkId,
      preview,
      previewMatchesSelectedAction,
      selectedAction,
      sharedSttReferenceStoreLoading,
      sharedReferenceReady,
      showSharedReferenceSetup,
      walletReady
    ]
  );
  // Wallet token ref is in the workspace header + Advanced wallet details on Home.
  // Access path is in the receipt KPIs. Both kept off the action review by default
  // to remove duplicate info — restore by adding label/value rows here if needed.
  void selectedDetectedTokenLabel;
  void selectedPathLabel;
  const reviewContextRows: Array<{ label: string; value: string | null }> = [];
  const reviewReceipt = useMemo<ReviewReceipt>(
    () =>
      computeReviewReceipt({
        mintStateForm,
        mintStarterAssets,
        sttStateForm,
        sttExtraTransfers,
        sttWalletInputs,
        consolidateWalletInputs,
        consolidateWalletOutputs,
        lockFundsAssets,
        activeActionDefinition,
        activeActionDraft,
        lockingContract,
        mintHasOwnerChoice,
        mintOwnerCount,
        selectedAction,
        selectedPathLabel,
        sharedSttReferenceStoreLoading,
        showSharedReferenceSetup,
        streamingPaymentPayoutTransfers
      }),
    [
      mintStateForm,
      mintStarterAssets,
      sttStateForm,
      sttExtraTransfers,
      sttWalletInputs,
      consolidateWalletInputs,
      consolidateWalletOutputs,
      lockFundsAssets,
      activeActionDefinition,
      activeActionDraft,
      lockingContract,
      mintHasOwnerChoice,
      mintOwnerCount,
      selectedAction,
      selectedPathLabel,
      sharedSttReferenceStoreLoading,
      showSharedReferenceSetup,
      streamingPaymentPayoutTransfers
    ]
  );
  const reviewPanelDescription =
    selectedAction === "mint"
      ? "Check the essentials. Your wallet will ask for approval next."
      : "Review the receipt, then continue in your wallet.";

  return {
    draftContext,
    actionDrafts,
    activeActionDraft,
    activeFieldErrors,
    activeReadinessIssues,
    activeActionDefinition,
    previewMatchesSelectedAction,
    lastActionDisplayLabel,
    primaryActionIssue,
    selectedPathLabel,
    mintOwnerCount,
    mintHasOwnerChoice,
    sharedReferenceReady,
    showSharedReferenceSetup,
    mintSetupSteps,
    reviewContextRows,
    reviewReceipt,
    reviewPanelDescription
  };
}
