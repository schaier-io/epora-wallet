"use client";
import { detectedSttTokensAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useWorkspaceRouteState } from "@/components/user/use-workspace-controller";
import { guidedOverviewSectionAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { connectStepPinnedAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { type WalletInputRef } from "@/lib/types/contracts";
import { useSetAtom, useAtomValue } from "jotai";
import { consolidateStateFormAtom, consolidateSttAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { mintReferenceAtom, mintStarterAssetsAtom, mintStateFormAtom, mintZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { proposalSttAssetsAtom, proposalSttInputHashAtom, proposalSttInputIndexAtom, proposalSttStateFormAtom, proposalZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/propose-form.atoms";
import { publishSttAssetsAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom, publishZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { consolidateAuthorityPathAtom, selectedSttActionAtom, streamingPaymentPayoutAmountsAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputOutputIndexAtom, sttInputTxHashAtom, sttOutputAssetsAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttStateFormAtom, sttTransferAddressAtom, sttTransferAmountsAtom, sttWalletInputsAtom, sttWalletOutputsAtom, sttZeroAdminConfirmedAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { transferCustomAddressAtom, transferDisplayAmountAtom, transferRecipientModeAtom, transferSelectedUnitAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { withdrawSttAssetsAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom, withdrawZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type StateFormState } from "@/lib/contracts/state-form";
import { type MintConfirmationState } from "@/components/user/workspace/types";
import { type BuildResult } from "@/lib/types/contracts";

import { type GuidedAdminGroupId } from "@/components/user/workspace/types";
import { GUIDED_ADMIN_TASK_MAP } from "@/components/user/workspace/constants";
import { type useRouter } from "next/navigation";
import { stashCaptureForBuild, type ProposalCapture } from "@/components/user/proposals/stash";

import type {
  UserActionKind,
  UserFlowBranch,
  UserWorkspaceIntent,
  UserWorkspaceTask
} from "@/components/user/flow-types";

import {
  chooseDefaultConsolidatePath,
  chooseDefaultOperatorPath
} from "@/components/user/wizard-capabilities";
import { orphanUtxosToWalletInputRefs } from "@/lib/discovery/orphan-utxos";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

import {
  stateFormFromDatum
} from "@/lib/contracts/state-form";

import {
  type DetectedSttToken
} from "@/lib/mesh/detection";

import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspaceGuidedDerivations } from "@/components/user/workspace/use-workspace-guided-derivations";
import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";
import { type useWorkspaceWalletDerivations } from "@/components/user/workspace/use-workspace-wallet-derivations";
import { type useWorkspaceReviewDerivations } from "@/components/user/workspace/use-workspace-review-derivations";
import { type useWorkspaceDraftHandlers } from "@/components/user/workspace/workspace-draft-handlers";
import { type useStore } from "jotai";
import { mintConfirmationRunAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { DEFAULT_MINT_STARTER_ASSETS, MAX_ORPHAN_SWEEP_INPUTS } from "@/components/user/workspace/constants";
import { cloneAssets, cloneStateForm, isSttFlowAction } from "@/components/user/workspace/helpers";
import { type useWalletActivity } from "@/components/user/workspace/use-wallet-activity";
import { type useSharedSttReference } from "@/components/user/workspace/use-shared-stt-reference";
import { type useLockedContractUtxos } from "@/components/user/workspace/use-locked-contract-utxos";

/**
 * The workspace navigation / intent-routing handlers, extracted from the controller.
 * They apply a detected token, open a workspace intent, switch flow branches, route
 * guided sections, and handle post-mint navigation. Not fund-critical (they set route +
 * draft state, never sign); the ctx spreads the form-hook shapes plus the route /
 * derivation values and the handful of non-form setters these handlers drive.
 */
export type WorkspaceNavigationCtx = {
  activeAddress: ReturnType<typeof useWalletContext>["activeAddress"];
  activeInferredSttStateForm: ReturnType<typeof useWorkspaceWalletDerivations>["activeInferredSttStateForm"];
  autoMintStateForm: StateFormState;
  clearBuildMessages: () => void;
  clearPreviewResult: () => void;
  flowAvailability: ReturnType<typeof useWorkspaceGuidedDerivations>["flowAvailability"];
  jotaiStore: ReturnType<typeof useStore>;
  lockingContract: ReturnType<typeof useWorkspaceWalletDerivations>["lockingContract"];
  mintConfirmation: MintConfirmationState | null;
  preview: BuildResult | null;
  proposalCaptureRef: MutableRefObject<ProposalCapture | null>;
  refreshLockedContractUtxos: ReturnType<typeof useLockedContractUtxos>["refreshLockedContractUtxos"];
  refreshSharedSttReferenceStore: ReturnType<typeof useSharedSttReference>["refreshSharedSttReferenceStore"];
  refreshWalletTransactions: ReturnType<typeof useWalletActivity>["refreshWalletTransactions"];
  resetActionDraft: ReturnType<typeof useWorkspaceDraftHandlers>["resetActionDraft"];
  resetSharedReferencePreview: ReturnType<typeof useSharedSttReference>["resetSharedReferencePreview"];
  reviewReceipt: ReturnType<typeof useWorkspaceReviewDerivations>["reviewReceipt"];
  router: ReturnType<typeof useRouter>;
  selectedDetectedToken: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedToken"];
  selectedTokenCapabilityMap: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedTokenCapabilityMap"];
  setSelectedDetectedTokenUnit: (nextUnit: string) => void;
  setMintConfirmation: Dispatch<SetStateAction<MintConfirmationState | null>>;
  pendingOrphanWalletInputsRef: MutableRefObject<WalletInputRef[] | null>;
  };

export function useWorkspaceNavigation(ctx: WorkspaceNavigationCtx) {
  const {
    activeAddress,
    activeInferredSttStateForm,
    autoMintStateForm,
    clearBuildMessages,
    clearPreviewResult,
    flowAvailability,
    jotaiStore,
    lockingContract,
    mintConfirmation,
    pendingOrphanWalletInputsRef,
    preview,
    proposalCaptureRef,
    refreshLockedContractUtxos,
    refreshSharedSttReferenceStore,
    refreshWalletTransactions,
    resetActionDraft,
    resetSharedReferencePreview,
    reviewReceipt,
    router,
    selectedDetectedToken,
    selectedTokenCapabilityMap,
    setMintConfirmation,
    setSelectedDetectedTokenUnit,
  } = ctx;
  const detectedSttTokens = useAtomValue(detectedSttTokensAtom);
  const { commitRouteState, dispatch: dispatchWorkspaceAction } = useWorkspaceRouteState();
  const setGuidedOverviewSection = useSetAtom(guidedOverviewSectionAtom);
  const setConnectStepPinned = useSetAtom(connectStepPinnedAtom);
  const setConfig = useSetAtom(configAtom);
  const setConsolidateAuthorityPath = useSetAtom(consolidateAuthorityPathAtom);
  const setConsolidateStateForm = useSetAtom(consolidateStateFormAtom);
  const setConsolidateSttAssets = useSetAtom(consolidateSttAssetsAtom);
  const setConsolidateSttInputHash = useSetAtom(consolidateSttInputHashAtom);
  const setConsolidateSttInputIndex = useSetAtom(consolidateSttInputIndexAtom);
  const setConsolidateWalletInputs = useSetAtom(consolidateWalletInputsAtom);
  const setConsolidateWalletOutputs = useSetAtom(consolidateWalletOutputsAtom);
  const setMintReference = useSetAtom(mintReferenceAtom);
  const setMintStarterAssets = useSetAtom(mintStarterAssetsAtom);
  const setMintStateForm = useSetAtom(mintStateFormAtom);
  const setMintZeroAdminConfirmed = useSetAtom(mintZeroAdminConfirmedAtom);
  const setProposalSttAssets = useSetAtom(proposalSttAssetsAtom);
  const setProposalSttInputHash = useSetAtom(proposalSttInputHashAtom);
  const setProposalSttInputIndex = useSetAtom(proposalSttInputIndexAtom);
  const setProposalSttStateForm = useSetAtom(proposalSttStateFormAtom);
  const setProposalZeroAdminConfirmed = useSetAtom(proposalZeroAdminConfirmedAtom);
  const setPublishSttAssets = useSetAtom(publishSttAssetsAtom);
  const setPublishSttInputHash = useSetAtom(publishSttInputHashAtom);
  const setPublishSttInputIndex = useSetAtom(publishSttInputIndexAtom);
  const setPublishSttStateForm = useSetAtom(publishSttStateFormAtom);
  const setPublishZeroAdminConfirmed = useSetAtom(publishZeroAdminConfirmedAtom);
  const setSelectedSttAction = useSetAtom(selectedSttActionAtom);
  const setStreamingPaymentPayoutAmounts = useSetAtom(streamingPaymentPayoutAmountsAtom);
  const setSttAuthorityPath = useSetAtom(sttAuthorityPathAtom);
  const setSttExtraTransfers = useSetAtom(sttExtraTransfersAtom);
  const setSttInputOutputIndex = useSetAtom(sttInputOutputIndexAtom);
  const setSttInputTxHash = useSetAtom(sttInputTxHashAtom);
  const setSttOutputAssets = useSetAtom(sttOutputAssetsAtom);
  const setSttProofOfLifeOverrideMode = useSetAtom(sttProofOfLifeOverrideModeAtom);
  const setSttProofOfLifeSpecificDateTime = useSetAtom(sttProofOfLifeSpecificDateTimeAtom);
  const setSttStateForm = useSetAtom(sttStateFormAtom);
  const setSttTransferAddress = useSetAtom(sttTransferAddressAtom);
  const setSttTransferAmounts = useSetAtom(sttTransferAmountsAtom);
  const setSttWalletInputs = useSetAtom(sttWalletInputsAtom);
  const setSttWalletOutputs = useSetAtom(sttWalletOutputsAtom);
  const setSttZeroAdminConfirmed = useSetAtom(sttZeroAdminConfirmedAtom);
  const setTransferCustomAddress = useSetAtom(transferCustomAddressAtom);
  const setTransferDisplayAmount = useSetAtom(transferDisplayAmountAtom);
  const setTransferRecipientMode = useSetAtom(transferRecipientModeAtom);
  const setTransferSelectedUnit = useSetAtom(transferSelectedUnitAtom);
  const setWalletOperatorPath = useSetAtom(walletOperatorPathAtom);
  const setWithdrawSttAssets = useSetAtom(withdrawSttAssetsAtom);
  const setWithdrawSttInputHash = useSetAtom(withdrawSttInputHashAtom);
  const setWithdrawSttInputIndex = useSetAtom(withdrawSttInputIndexAtom);
  const setWithdrawSttStateForm = useSetAtom(withdrawSttStateFormAtom);
  const setWithdrawZeroAdminConfirmed = useSetAtom(withdrawZeroAdminConfirmedAtom);

  const handleSaveProposalFromBuild = () => {
    const capture = proposalCaptureRef.current;
    if (!capture || !preview?.txHex) {
      return;
    }
    stashCaptureForBuild(
      {
        ...capture,
        summary: {
          headline: reviewReceipt.summary || reviewReceipt.title,
          rows: reviewReceipt.items.map((item) => ({ label: item.label, value: item.value }))
        }
      },
      preview.txHex
    );
    router.push("/user/proposals?create=1");
  };

  const applyDetectedToken = (token: DetectedSttToken) => {
    const nextStateForm = stateFormFromDatum(token.datum);
    const inputTxHash = token.utxo.input.txHash;
    const inputOutputIndex = token.utxo.input.outputIndex.toString();

    setConfig((current) => ({
      ...current,
      sttAssetNameHex: token.assetNameHex,
      walletPolicyId: token.policyId,
      walletAssetNameHex: token.assetNameHex
    }));
    setSttInputTxHash(inputTxHash);
    setSttInputOutputIndex(inputOutputIndex);
    setSttZeroAdminConfirmed(false);
    setWithdrawSttInputHash(inputTxHash);
    setWithdrawSttInputIndex(inputOutputIndex);
    setWithdrawZeroAdminConfirmed(false);
    setPublishSttInputHash(inputTxHash);
    setPublishSttInputIndex(inputOutputIndex);
    setPublishZeroAdminConfirmed(false);
    setProposalSttInputHash(inputTxHash);
    setProposalSttInputIndex(inputOutputIndex);
    setProposalZeroAdminConfirmed(false);
    setConsolidateSttInputHash(inputTxHash);
    setConsolidateSttInputIndex(inputOutputIndex);
    setSttStateForm(cloneStateForm(nextStateForm));
    setSttOutputAssets([]);
    setSttWalletInputs([]);
    setSttWalletOutputs([]);
    setSttExtraTransfers([]);
    setSttProofOfLifeOverrideMode("auto");
    setSttProofOfLifeSpecificDateTime("");
    setSttTransferAddress("");
    setSttTransferAmounts({});
    setTransferRecipientMode(activeAddress ? "my-address" : "custom");
    setTransferCustomAddress("");
    setTransferSelectedUnit("lovelace");
    setTransferDisplayAmount("");
    setStreamingPaymentPayoutAmounts({});
    setWithdrawSttStateForm(cloneStateForm(nextStateForm));
    setWithdrawSttAssets([]);
    setPublishSttStateForm(cloneStateForm(nextStateForm));
    setPublishSttAssets([]);
    setProposalSttStateForm(cloneStateForm(nextStateForm));
    setProposalSttAssets([]);
    setConsolidateStateForm(cloneStateForm(nextStateForm));
    setConsolidateSttAssets([]);
    setConsolidateWalletInputs([]);
    setConsolidateWalletOutputs([]);
  };

  function handleDetectedTokenChange(token: DetectedSttToken) {
    // Switch to the wallet the user explicitly picked, using the token the card
    // already holds — do NOT re-find it in `detectedSttTokens`. That list can
    // transiently empty or change between render and click (chain-detection
    // flakiness), and a failed re-lookup here previously fell back to landing,
    // which the auto-open-default / auto-create-wallet effects then turned into
    // "opened the wrong (default) wallet" or "bounced back into create mode"
    // when selecting from create mode.
    setGuidedOverviewSection("home");
    commitRouteState({
      workspaceMode: "existing-wallet",
      selectedWalletUnit: token.unit,
      selectedAction: null,
      selectedIntent: null,
      selectedTask: null,
      flowStep: "overview"
    });
    applyDetectedToken(token);
    resetSharedReferencePreview();
    void refreshSharedSttReferenceStore();
    void refreshLockedContractUtxos(lockingContract.address);
    void refreshWalletTransactions();
    clearPreviewResult();
    clearBuildMessages();
  }

  function openWorkspaceIntent(
    intent: UserWorkspaceIntent,
    nextAction: UserActionKind,
    task?: UserWorkspaceTask | null
  ) {
    setConnectStepPinned(false);
    dispatchWorkspaceAction({
      type: "select-workspace-action",
      intent,
      action: nextAction,
      task,
      flowStep: "configure"
    });
    if (isSttFlowAction(nextAction)) {
      setSelectedSttAction(nextAction);
    }
    if (
      selectedTokenCapabilityMap &&
      (nextAction === "use" ||
        nextAction === "update-state" ||
        nextAction === "manage-streaming-payments" ||
        nextAction === "wallet-withdraw" ||
        nextAction === "wallet-publish" ||
        nextAction === "wallet-propose")
    ) {
      const nextPath = chooseDefaultOperatorPath(selectedTokenCapabilityMap);
      setSttAuthorityPath(nextPath);
      setWalletOperatorPath(nextPath);
    }
    if (selectedTokenCapabilityMap && nextAction === "consolidate-utxo") {
      setConsolidateAuthorityPath(chooseDefaultConsolidatePath(selectedTokenCapabilityMap));
    }
    clearPreviewResult();
    clearBuildMessages();
  }

  function handleFlowBranchSelect(nextBranch: UserFlowBranch) {
    setConnectStepPinned(false);
    clearBuildMessages();
    clearPreviewResult();

    if (nextBranch === "new-wallet") {
      dispatchWorkspaceAction({ type: "start-create-wallet" });
      setConfig((current) => ({
        ...current,
        sttAssetNameHex: "",
        walletAssetNameHex: ""
      }));
      setMintReference("");
      setMintStateForm(cloneStateForm(autoMintStateForm));
      setMintStarterAssets(cloneAssets(DEFAULT_MINT_STARTER_ASSETS));
      setMintZeroAdminConfirmed(false);
      return;
    }

    dispatchWorkspaceAction({
      type: selectedDetectedToken ? "clear-selected-action" : "open-landing"
    });
  }

  function handleConsolidateOrphans(orphans: DiscoveredUtxo[]) {
    if (!selectedDetectedToken) {
      return;
    }
    const allRefs = orphanUtxosToWalletInputRefs(orphans);
    // Sweep at most one batch per transaction (each input is execution-unit
    // heavy). Never leave exactly one straggler behind — consolidate needs >=2
    // inputs, so the next re-check couldn't sweep a lone leftover.
    let take = Math.min(allRefs.length, MAX_ORPHAN_SWEEP_INPUTS);
    if (take >= 2 && allRefs.length - take === 1) {
      take -= 1;
    }
    const refs = allRefs.slice(0, take);
    pendingOrphanWalletInputsRef.current = refs;
    setConsolidateSttInputHash(selectedDetectedToken.utxo.input.txHash);
    setConsolidateSttInputIndex(String(selectedDetectedToken.utxo.input.outputIndex));
    setConsolidateWalletInputs(refs);
    openWorkspaceIntent("consolidate", "consolidate-utxo");
  }

  function handleCreateAnotherWallet() {
    jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
    setMintConfirmation(null);
    setSelectedDetectedTokenUnit("");
    handleFlowBranchSelect("new-wallet");
    resetActionDraft("mint");
  }

  const handleOpenCreatedWallet = () => {
    const createdWalletUnit = mintConfirmation?.createdWalletUnit;

    if (!createdWalletUnit) {
      return;
    }

    const createdToken = detectedSttTokens.find((token) => token.unit === createdWalletUnit);
    jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
    setMintConfirmation(null);
    setSelectedDetectedTokenUnit(createdWalletUnit);

    if (createdToken) {
      applyDetectedToken(createdToken);
    }
  };

  function handleFocusedTaskSelect(taskId: UserWorkspaceTask) {
    if (taskId === "streaming-payments-pay-due" && !flowAvailability.canPayStreamingPayments) {
      return;
    }

    const taskDefinition = GUIDED_ADMIN_TASK_MAP[taskId];
    openWorkspaceIntent(taskDefinition.intent, taskDefinition.action, taskId);
  }

  function openGuidedAdminGroup(groupId: GuidedAdminGroupId) {
    if (groupId === "manage-people") {
      handleFocusedTaskSelect("people-admins-signers");
      return;
    }

    if (groupId === "wallet-settings") {
      handleFocusedTaskSelect("settings-wallet-name");
      return;
    }

    if (flowAvailability.canManageStreamingPayments) {
      handleFocusedTaskSelect(
        activeInferredSttStateForm.streamingPayments.length > 0
          ? "streaming-payments-edit-renew"
          : "streaming-payments-add"
      );
      return;
    }

    if (flowAvailability.canPayStreamingPayments) {
      handleFocusedTaskSelect("streaming-payments-pay-due");
    }
  }

  return {
    handleSaveProposalFromBuild,
    applyDetectedToken,
    handleDetectedTokenChange,
    openWorkspaceIntent,
    handleFlowBranchSelect,
    handleConsolidateOrphans,
    handleCreateAnotherWallet,
    handleOpenCreatedWallet,
    handleFocusedTaskSelect,
    openGuidedAdminGroup
  };
}
