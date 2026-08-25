"use client";
import { useAtomValue } from "jotai";
import { activeSttAuthorityOptionsAtom, walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { setupStateAtom } from "@/components/user/workspace/atoms/workspace-setup-state.atoms";
import { activityAnchorTxHashesAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";

import { useEffect } from "react";

import type { UserOverviewSection } from "@/components/user/flow-types";

import { useWorkspaceFoundation } from "@/components/user/workspace/use-workspace-foundation";

import { prefetchAssetIcons } from "@/components/user/asset-icon";

import { useWorkspaceGuidedDerivations } from "@/components/user/workspace/use-workspace-guided-derivations";
import { useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";
import { useWorkspaceWalletDerivations } from "@/components/user/workspace/use-workspace-wallet-derivations";
import { useWorkspaceTransferDerivations } from "@/components/user/workspace/use-workspace-transfer-derivations";
import { useWorkspaceReviewDerivations } from "@/components/user/workspace/use-workspace-review-derivations";
import { useWorkspacePermissionWalletCards } from "@/components/user/workspace/use-workspace-permission-wallet-cards";
import { createWorkspaceTransactions } from "@/components/user/workspace/workspace-transactions";
import { createWorkspaceFlowHandlers } from "@/components/user/workspace/workspace-flow-handlers";
import { useWorkspaceDraftHandlers } from "@/components/user/workspace/workspace-draft-handlers";
import { useWorkspaceSttEditors } from "@/components/user/workspace/workspace-stt-editors";
import { useWorkspaceNavigation } from "@/components/user/workspace/workspace-navigation";
import { useWorkspaceEffects } from "@/components/user/workspace/use-workspace-effects";

import { hasFieldErrors } from "@/components/user/workspace/helpers";
import { useWalletActivity } from "@/components/user/workspace/use-wallet-activity";
import { useWorkspaceActionSignature } from "@/components/user/workspace/use-workspace-action-signature";
import { useWorkspaceActionFieldErrors } from "@/components/user/workspace/use-workspace-action-field-errors";

export function usePermissionWalletWorkspaceState() {
  const {
    activeAddress,
    activeWallet,
    activeWalletName,
    activePaymentKeyHash,
    isDemoWallet,
    networkId,
    refreshSharedSttReferenceStore,
    createInlineSharedReference,
    resetSharedReferencePreview,
    rememberRecipient,
    rememberRecipients,
    copyTextToClipboard,
    smartWalletDisplay,
    mintForm,
    mintStateForm,
    previousAutoMintStateRef,
    sttWalletInputs,
    setSttWalletInputs,
    sttExtraTransfers,
    sttAuthorityPath,
    setSttAuthorityPath,
    walletOperatorPath,
    setWalletOperatorPath,
    refreshLockedContractUtxos,
    activeBuild,
    setActiveBuild,
    activeSubmit,
    setActiveSubmit,
    setBuildError,
    setBuildErrorDetails,
    submitHash,
    setSubmitHash,
    mintConfirmation,
    setMintConfirmation,
    setMintCelebration,
    mintCelebrationRef,
    mintedWalletName,
    setMintedWalletName,
    postSubmitRefreshTimersRef,
    preview,
    setPreview,
    previewSignature,
    setPreviewSignature,
    lastActionLabel,
    setLastActionLabel,
    jotaiStore,
    clearBuildMessages,
    clearPreviewResult,
    walletSessionKeyRef,
    actionConfigurationRef,
    router,
    proposalCaptureRef,
    submitInFlightRef,
    walletReady,
    refreshWalletBalance,
    setupCheckpoint,
    dispatchWorkspaceAction,
    commitRouteState,
    routeState,
    selectedDetectedTokenUnit,
    userFlowBranch,
    wizardSelectedAction,
    selectedAction,
    effectiveSttAction,
    wizardStep,
    selectedIntent,
    resolvedSelectedTask,
    setSelectedDetectedTokenUnit,
    refreshDetectedTokens,
    refreshPermissionWalletSummaries,
    setWizardStep,
    setWizardSelectedAction,
    existingWalletNames,
    autoMintStateForm
  } = useWorkspaceFoundation();
  const {
    effectiveWalletAssetNameHex,
    selectedDetectedToken,
    selectedDetectedTokenAssets,
    selectedDetectedTokenLabel,
    selectedDetectedTokenStateForm,
    selectedTokenCapabilityMap,
    advancedWalletActions,
    selectableWizardActionKinds
  } = useWorkspaceDetectedTokenDerivations();
  const {
    permissionWalletCards,
    filteredPermissionWalletCards,
    autoOpenDetectedWalletUnit,
    defaultDetectedWalletUnit,
    knownPermissionWalletCount,
    selectedPermissionWalletCard,
    smartWalletDisplayPublish,
    smartWalletDisplayReset
  } = useWorkspacePermissionWalletCards({
    activePaymentKeyHash,
    selectedDetectedTokenUnit,
    smartWalletDisplay
  });

  const activeSttAuthorityOptions = useAtomValue(activeSttAuthorityOptionsAtom);
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);

  // Clamp the selected authority/operator paths to a valid option as their
  // option sets change. Kept in effects (a render-phase adjustment loops here
  // because the option sets are themselves derived from related state).
  useEffect(() => {
    if (!activeSttAuthorityOptions.some((option) => option.value === sttAuthorityPath)) {
       
      setSttAuthorityPath(activeSttAuthorityOptions[0]?.value ?? "admin");
    }
  }, [activeSttAuthorityOptions, sttAuthorityPath, setSttAuthorityPath]);
  useEffect(() => {
    if (!walletOperatorOptions.some((option) => option.value === walletOperatorPath)) {
       
      setWalletOperatorPath(walletOperatorOptions[0]?.value ?? "admin");
    }
  }, [walletOperatorOptions, walletOperatorPath, setWalletOperatorPath]);
  const {
    activeInferredSttStateForm,
    useAllowancePreview,
    lockingContract,
    totalLockedContractAssets
  } = useWorkspaceWalletDerivations();
  useEffect(() => {
    const units = totalLockedContractAssets
      .map((asset) => asset.unit)
      .filter((unit) => unit !== "lovelace");
    if (units.length > 0) prefetchAssetIcons(units);
  }, [totalLockedContractAssets]);
  const {
    setActivityPageIndex,
    runWalletTransactionsRefresh,
    refreshWalletTransactions,
    prependSubmittedTransaction
  } = useWalletActivity();
  // Activity feed values are derived atoms (workspace-activity.atoms.ts); the transfer/guided
  // derivations self-source them. The controller only needs the anchor hashes for the tx builders.
  const activityAnchorTxHashes = useAtomValue(activityAnchorTxHashesAtom);

  const {
    availableLockedTransferAssets,
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    requestedLockedAssetTotals,
    suggestedLockedInputs
  } = useWorkspaceTransferDerivations();

  useEffect(() => {
    void refreshLockedContractUtxos(lockingContract.address);
  }, [lockingContract.address, refreshLockedContractUtxos]);

  const setupState = useAtomValue(setupStateAtom);

  const actionFieldErrorsMap = useWorkspaceActionFieldErrors({
    activeInferredSttStateForm,
    activePaymentKeyHash,
    existingWalletNames,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    useAllowancePreview
  });

  const buildActionSignature = useWorkspaceActionSignature({
    activePaymentKeyHash,
    selectedDetectedToken,
    selectedDetectedTokenStateForm
  });

  const {
    actionDrafts,
    activeActionDraft,
    activeFieldErrors,
    activeReadinessIssues,
    activeActionDefinition,
    previewMatchesSelectedAction,
    lastActionDisplayLabel,
    primaryActionIssue,
    showSharedReferenceSetup,
    mintSetupSteps,
    reviewContextRows,
    reviewReceipt,
    reviewPanelDescription
  } = useWorkspaceReviewDerivations({
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
  });

  const {
    withBuildGuard,
    addSubmittedTransactionToActivity,
    watchMintCreationConfirmation
    // We pass a stable ref *object* (`proposalCaptureRef`, not `.current`) into the factory;
    // the handlers read/write `.current` only inside async callbacks, never during render.
     
  } = createWorkspaceFlowHandlers({
    activeWallet,
    activeWalletName,
    isDemoWallet,
    networkId,
    buildActionSignature,
    jotaiStore,
    lockingContract,
    prependSubmittedTransaction,
    proposalCaptureRef,
    refreshDetectedTokens,
    refreshLockedContractUtxos,
    refreshPermissionWalletSummaries,
    refreshWalletBalance,
    setActiveBuild,
    setBuildError,
    setBuildErrorDetails,
    setLastActionLabel,
    setMintConfirmation,
    setPreview,
    setPreviewSignature,
    setSubmitHash
  });

  // Stashes the just-built transaction + its builder inputs and routes to the
  // proposals create flow. Captured context (set during build) enables rebuild.

  // "Move to my wallet address": prefill the Consolidate flow with the STT input
  // and the discovered orphan UTxOs (matched on-chain by payment credential, so
  // foreign-stake UTxOs can be swept), then open it for review and submission.
  // The value is preserved and returned to the wallet's intended address.

  const {
    resetActionDraft,
    clearActionDraft
  } = useWorkspaceDraftHandlers({
    autoMintStateForm,
    clearBuildMessages,
    clearPreviewResult,
    selectedDetectedToken,
    pendingOrphanWalletInputsRef: mintForm.pendingOrphanWalletInputsRef
  });

  async function refreshWorkspaceSummary(includeWalletTransactions: boolean) {
    await refreshLockedContractUtxos(lockingContract.address);
    await refreshPermissionWalletSummaries();
    if (includeWalletTransactions && lockingContract.address) {
      await runWalletTransactionsRefresh({
        walletAddress: lockingContract.address,
        sttScriptAddress: selectedDetectedToken?.scriptAddress ?? null,
        sttUnit: selectedDetectedToken?.unit ?? null,
        anchorTxHashes: activityAnchorTxHashes
      });
    }
  }

  const {
    buildAndSubmitSelectedActionTx,
    // Build-only, no signature. The review dock uses it to prepare an approval request.
    buildSelectedActionTx
    // We pass stable ref *objects* (not `.current`) into the transactions factory; the
    // builders read `.current` only inside async callbacks, never during render.
     
  } = createWorkspaceTransactions({
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
  });
  // These four actions leave the workspace ready to run again: what they staged is cleared
  // at submit, so the button goes back to its own label and the readiness gate below holds
  // it shut until something new is staged. It used to freeze at a disabled "Done" -- a dead
  // control whose only escape was `Clear form` in a different card. The submitted
  // transaction and its hash stay on screen in the block underneath. `mint` is excluded on
  // purpose: it creates one wallet, and its own overlay owns the after-state.
  const repeatableJustSubmitted =
    Boolean(submitHash) &&
    (selectedAction === "use" ||
      selectedAction === "use-allowance" ||
      selectedAction === "use-beneficiary" ||
      selectedAction === "lock-funds");
  const reviewPrimaryActionLabel =
    submitHash && !repeatableJustSubmitted
    ? "Done"
    : activeBuild === selectedAction
      ? "Preparing..."
      : activeSubmit
        ? "Confirming..."
        : activeActionDefinition.label;

  // Once the mint confirms, capture a celebration snapshot (wallet name, policy,
  // unit) ONCE. Held in its own state so it survives the confirmation polling and
  // the auto-open navigation — it's the final stop the visitor dismisses manually.

  // Clear any pending post-submit refresh timers on unmount.

  // Auto-pick the fund pools once a send payout is staged, so the wallet really
  // does "pick the right fund pools for you" — no need to open Advanced and click
  // Select suggested inputs. Only fills when nothing is selected yet, so a manual
  // choice is never overridden.

  // Tied ONLY to the confirmation state — NOT to selectedAction / the URL wallet.
  // During the "refreshing" poll the workspace can re-select the previously-open
  // wallet (selectedAction flips to "use"); keying off that flipped the overlay
  // off mid-mint (the flash + premature close). mintConfirmation is set for the
  // whole run (submitting→…→confirmed), so the overlay now stays put until done.
  // The in-progress overlay runs only BEFORE confirmation; the celebration takes
  // over at 100%.
  const reviewPrimaryActionDisabled =
    activeBuild === selectedAction ||
    activeSubmit ||
    (Boolean(submitHash) && !repeatableJustSubmitted) ||
    hasFieldErrors(activeFieldErrors) ||
    activeReadinessIssues.some((issue) => issue.blocking);
   
  const {
    flowAvailability,
    guidedEverydayActions,
    guidedAdminGroups,
    guidedStreamingPaymentTaskBadges,
    guidedAdminGroupBadgeText,
    guidedAdminGroupStatusText,
    guidedAdminGroupSummary,
    guidedStreamingPaymentsDisabledTasks,
    guidedToolActions,
    selectedActionDefinition,
    selectedActionRouteExplanation,
    selectedActionSetupCta,
    sendRouteExplanation,
    hasActiveComposer,
    showGuidedSidebar,
    hasGuidedActivityContext,
    resolvedGuidedOverviewSection,
    activeAdminGroupId,
    isGuidedHomeSelected,
    isGuidedTransactionsSelected
  } = useWorkspaceGuidedDerivations({
    actionDrafts,
    activeInferredSttStateForm,
    advancedWalletActions,
    selectedAction,
    selectedDetectedToken,
    selectedIntent,
    selectedTokenCapabilityMap,
    useAllowancePreview,
    userFlowBranch,
    wizardSelectedAction
  });

  function openGuidedOverview(section: UserOverviewSection) {
    // Asking for Activity when there is nothing to show lands on home instead.
    const nextSection =
      section === "transactions" && !hasGuidedActivityContext ? "home" : section;

    if (nextSection === "transactions") {
      setActivityPageIndex(0);
    }
    // A single dispatch, and it writes `?view=`. It used to be a `clear-selected-action`
    // beside a `useState`, which produced a byte-identical search string when no action was
    // open, so `commitRouteState` returned early and no history entry was ever created.
    dispatchWorkspaceAction({ type: "open-overview-section", section: nextSection });
  }

  // Opening an asset row opens Activity around it, in one navigation rather than two.
  function openAssetDetail(unit: string | null) {
    commitRouteState(
      {
        ...routeState,
        selectedAction: null,
        selectedIntent: null,
        selectedTask: null,
        flowStep: "overview",
        overviewSection: "transactions",
        assetDetailUnit: unit
      },
      { history: "push" }
    );
  }

  const {
    addLockedContractInputRef,
    applySuggestedLockedInputs,
    updateSttTransferAmount,
    addSttTransferRecipient,
    addSimpleTransferRecipient
  } = useWorkspaceSttEditors({
    activeAddress,
    availableLockedTransferAssets,
    requestedLockedAssetTotals,
    effectiveSttAction,
    suggestedLockedInputs,
    setBuildError,
    setBuildErrorDetails,
    rememberRecipient
  });

  const {
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
    // Stable ref object (`proposalCaptureRef`) passed into the navigation factory;
    // read inside event handlers, never during render.
     
  } = useWorkspaceNavigation({
    activeInferredSttStateForm,
    autoMintStateForm,
    clearBuildMessages,
    clearPreviewResult,
    flowAvailability,
    jotaiStore,
    lockingContract,
    mintConfirmation,
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
    setSelectedDetectedTokenUnit,
    setMintConfirmation,
    pendingOrphanWalletInputsRef: mintForm.pendingOrphanWalletInputsRef
    });

  useWorkspaceEffects({
    actionConfigurationRef,
    activeAddress,
    activeWalletName,
    autoMintStateForm,
    availableLockedTransferAssets,
    clearBuildMessages,
    clearPreviewResult,
    defaultDetectedWalletUnit,
    hasActiveComposer,
    jotaiStore,
    knownPermissionWalletCount,
    mintCelebrationRef,
    mintConfirmation,
    mintStateForm,
    mintedWalletName,
    networkId,
    permissionWalletCards,
    postSubmitRefreshTimersRef,
    previousAutoMintStateRef,
    resetSharedReferencePreview,
    resolvedSelectedTask,
    selectableWizardActionKinds,
    selectedAction,
    selectedDetectedToken,
    selectedDetectedTokenUnit,
    selectedPermissionWalletCard,
    setBuildError,
    setBuildErrorDetails,
    setLastActionLabel,
    setMintCelebration,
    setMintConfirmation,
    setPreview,
    setPreviewSignature,
    setSelectedDetectedTokenUnit,
    setSttWalletInputs,
    setSubmitHash,
    setWizardSelectedAction,
    setWizardStep,
    smartWalletDisplayPublish,
    smartWalletDisplayReset,
    streamingPaymentPayoutRows,
    sttExtraTransfers,
    sttWalletInputs,
    suggestedLockedInputs,
    userFlowBranch,
    walletReady,
    walletSessionKeyRef,
    wizardSelectedAction,
    wizardStep
  });

  // The workspace's public surface, grouped by concern. This is a wide object
  // (views read it via useWorkspaceActions()); the groups are the map of what
  // lives where. The review-phase derivations below are still computed in hooks
  // and threaded here rather than read from the atom graph — see the
  // `workspace-review-derivations-still-hook-threaded` note: moving them onto
  // derived atoms needs the review pipeline (useUserFlowState + its non-atom
  // inputs) untangled first, and is best done behind the new component harness.
  return {
    // Action drafts + the selected action's config/definition.
    actionConfigurationRef,
    actionDrafts,
    activeActionDefinition,
    activeActionDraft,
    clearActionDraft,
    resetActionDraft,
    dispatchWorkspaceAction,
    selectedActionDefinition,

    // Review phase: field errors, readiness, receipt, and the primary CTA state.
    activeFieldErrors,
    activeReadinessIssues,
    previewMatchesSelectedAction,
    primaryActionIssue,
    reviewContextRows,
    reviewPanelDescription,
    reviewReceipt,
    reviewPrimaryActionLabel,
    reviewPrimaryActionDisabled,
    lastActionDisplayLabel,
    mintSetupSteps,
    showSharedReferenceSetup,

    // Build + submit the selected action, and save a built tx as a proposal.
    buildAndSubmitSelectedActionTx,
    buildSelectedActionTx,
    handleSaveProposalFromBuild,
    proposalCaptureRef,

    // Detected token + locked-input helpers.
    addLockedContractInputRef,
    applyDetectedToken,
    applySuggestedLockedInputs,
    autoOpenDetectedWalletUnit,
    handleDetectedTokenChange,
    setSelectedDetectedTokenUnit,

    // Transfer recipients.
    addSimpleTransferRecipient,
    addSttTransferRecipient,
    updateSttTransferAmount,

    // Permission-wallet cards + selection.
    filteredPermissionWalletCards,
    permissionWalletCards,
    selectedPermissionWalletCard,

    // Data refreshers.
    refreshDetectedTokens,
    refreshLockedContractUtxos,
    refreshPermissionWalletSummaries,
    refreshWalletTransactions,
    refreshWorkspaceSummary,
    setActivityPageIndex,

    // Navigation, intents, and top-level flow actions.
    openWorkspaceIntent,
    handleFlowBranchSelect,
    handleConsolidateOrphans,
    handleCreateAnotherWallet,
    handleOpenCreatedWallet,
    copyTextToClipboard,
    createInlineSharedReference,
    setupCheckpoint,

    // Guided sidebar: sections, admin groups, badges, and selection state.
    flowAvailability,
    guidedEverydayActions,
    guidedAdminGroups,
    guidedStreamingPaymentTaskBadges,
    guidedAdminGroupBadgeText,
    guidedAdminGroupStatusText,
    guidedAdminGroupSummary,
    guidedStreamingPaymentsDisabledTasks,
    guidedToolActions,
    selectedActionRouteExplanation,
    selectedActionSetupCta,
    sendRouteExplanation,
    hasActiveComposer,
    showGuidedSidebar,
    hasGuidedActivityContext,
    resolvedGuidedOverviewSection,
    activeAdminGroupId,
    isGuidedHomeSelected,
    isGuidedTransactionsSelected,
    handleFocusedTaskSelect,
    openGuidedAdminGroup,
    openAssetDetail,
    openGuidedOverview,
  };
}

export type PermissionWalletWorkspaceState = ReturnType<typeof usePermissionWalletWorkspaceState>;
