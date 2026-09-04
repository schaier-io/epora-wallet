"use client";
import { detectedSttTokensAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useWorkspaceRouteState } from "@/components/user/use-workspace-controller";
import { connectStepPinnedAtom, renderNowMsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { type WalletInputRef } from "@/lib/types/contracts";
import { useSetAtom, useAtomValue } from "jotai";
import { consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { mintReferenceAtom, mintStarterAssetsAtom, mintStateFormAtom, mintZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { consolidateAuthorityPathAtom, selectedSttActionAtom, streamingPaymentPayoutAmountsAtom, sttAuthorityPathAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { seedWorkspaceWalletAtom } from "@/components/user/workspace/atoms/workspace-wallet-seeding.atoms";
import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type StateFormState } from "@/lib/contracts/state-form";
import { type MintConfirmationState } from "@/components/user/workspace/types";
import { type BuildResult } from "@/lib/types/contracts";

import { type GuidedAdminGroupId } from "@/components/user/workspace/types";
import { GUIDED_ADMIN_TASK_MAP } from "@/components/user/workspace/guided-admin-catalog";
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
  type DetectedSttToken
} from "@/lib/mesh/detection";

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
import { type useSharedSttReference } from "@/components/user/workspace/use-shared-stt-reference";
/**
 * The workspace navigation / intent-routing handlers, extracted from the controller.
 * They apply a detected token, open a workspace intent, switch flow branches, route
 * guided sections, and handle post-mint navigation. Not fund-critical (they set route +
 * draft state, never sign); the ctx spreads the form-hook shapes plus the route /
 * derivation values and the handful of non-form setters these handlers drive.
 */
export type WorkspaceNavigationCtx = {
  activeInferredSttStateForm: ReturnType<typeof useWorkspaceWalletDerivations>["activeInferredSttStateForm"];
  autoMintStateForm: StateFormState;
  clearBuildMessages: () => void;
  clearPreviewResult: () => void;
  flowAvailability: ReturnType<typeof useWorkspaceGuidedDerivations>["flowAvailability"];
  jotaiStore: ReturnType<typeof useStore>;
  mintConfirmation: MintConfirmationState | null;
  preview: BuildResult | null;
  proposalCaptureRef: MutableRefObject<ProposalCapture | null>;
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
    activeInferredSttStateForm,
    autoMintStateForm,
    clearBuildMessages,
    clearPreviewResult,
    flowAvailability,
    jotaiStore,
    mintConfirmation,
    pendingOrphanWalletInputsRef,
    preview,
    proposalCaptureRef,
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
  const { routeState, commitRouteState, dispatch: dispatchWorkspaceAction } = useWorkspaceRouteState();
  const setRenderNowMs = useSetAtom(renderNowMsAtom);
  const setConnectStepPinned = useSetAtom(connectStepPinnedAtom);
  const setConfig = useSetAtom(configAtom);
  const setConsolidateAuthorityPath = useSetAtom(consolidateAuthorityPathAtom);
  const setConsolidateSttInputHash = useSetAtom(consolidateSttInputHashAtom);
  const setConsolidateSttInputIndex = useSetAtom(consolidateSttInputIndexAtom);
  const setConsolidateWalletInputs = useSetAtom(consolidateWalletInputsAtom);
  const setMintReference = useSetAtom(mintReferenceAtom);
  const setMintStarterAssets = useSetAtom(mintStarterAssetsAtom);
  const setMintStateForm = useSetAtom(mintStateFormAtom);
  const setMintZeroAdminConfirmed = useSetAtom(mintZeroAdminConfirmedAtom);
  const setSelectedSttAction = useSetAtom(selectedSttActionAtom);
  const setStreamingPaymentPayoutAmounts = useSetAtom(streamingPaymentPayoutAmountsAtom);
  const setSttAuthorityPath = useSetAtom(sttAuthorityPathAtom);
  const setWalletOperatorPath = useSetAtom(walletOperatorPathAtom);

  // `txHexOverride` carries the hex of a build that just finished: the caller prepares the
  // transaction, then saves it in the same click, and `preview` is still the pre-build value
  // in this closure. The capture is a ref, so it needs no override.
  const handleSaveProposalFromBuild = (txHexOverride?: string) => {
    const capture = proposalCaptureRef.current;
    const txHex = txHexOverride ?? preview?.txHex;
    if (!capture || !txHex) {
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
      txHex
    );
    // Carry the wallet across, so coming back from proposals returns to this wallet
    // instead of whichever one the app would auto-pick.
    const proposalsSearch = new URLSearchParams({ create: "1" });
    if (routeState.selectedWalletUnit) {
      proposalsSearch.set("wallet", routeState.selectedWalletUnit);
    }
    router.push(`/user/proposals?${proposalsSearch.toString()}`);
  };

  const applyDetectedToken = (token: DetectedSttToken) => {
    jotaiStore.set(seedWorkspaceWalletAtom, token);
  };

  function handleDetectedTokenChange(token: DetectedSttToken) {
    // Switch to the wallet the user explicitly picked, using the token the card
    // already holds. Do NOT re-find it in `detectedSttTokens`. That list can
    // transiently empty or change between render and click (chain-detection
    // flakiness), and a failed re-lookup here previously fell back to landing,
    // which the auto-open-default / auto-create-wallet effects then turned into
    // "opened the wrong (default) wallet" or "bounced back into create mode"
    // when selecting from create mode.
    commitRouteState(
      {
        workspaceMode: "existing-wallet",
        selectedWalletUnit: token.unit,
        selectedAction: null,
        selectedIntent: null,
        selectedTask: null,
        flowStep: "overview",
        overviewSection: "home",
        assetDetailUnit: null
      },
      // The user picked this wallet, so Back should return to whatever they were looking at.
      { history: "push" }
    );
    applyDetectedToken(token);
    resetSharedReferencePreview();
    clearPreviewResult();
    clearBuildMessages();
    // Nothing is fetched here on purpose. `applyDetectedToken` has already written the new
    // wallet into config, and the locked-UTxO and activity fetches are keyed on the derived
    // wallet address, so they re-run for the new wallet on their own. The three refreshes
    // that used to sit on this line read `lockingContract.address` and `walletAddress` out of
    // THIS render's closure, which still described the wallet being left: every switch spent
    // a full round of chain requests re-reading the old wallet, delaying the new one's data
    // behind them and burning rate-limit budget for a result that was discarded. The shared
    // STT reference store is one deployment-wide record loaded on mount; which smart wallet
    // is open cannot change it.
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
    if (nextAction === "payout-streaming-payment") {
      // One frozen reference prices the displayed maximum/default and becomes
      // the builder's concrete validity window. Re-entering refreshes the quote.
      setRenderNowMs(Date.now());
      setStreamingPaymentPayoutAmounts({});
    }
    if (
      selectedTokenCapabilityMap &&
      (nextAction === "use" ||
        nextAction === "update-state" ||
        nextAction === "manage-streaming-payments" ||
        nextAction === "wallet-withdraw" ||
        nextAction === "wallet-publish" ||
        nextAction === "wallet-vote")
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
    // heavy). A lone remainder is safe: address migration deliberately permits
    // one input when it moves from a non-canonical stake variant.
    const take = Math.min(allRefs.length, MAX_ORPHAN_SWEEP_INPUTS);
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
    if (groupId === "wallet-settings") {
      handleFocusedTaskSelect("settings-people");
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
