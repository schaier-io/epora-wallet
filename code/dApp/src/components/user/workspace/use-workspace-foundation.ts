"use client";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, sharedSttReferenceStoreAtom, sharedSttReferenceStoreLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { type ProposalCapture } from "@/components/user/proposals/stash";

import type {
  UserActionKind,
  UserWizardStep
} from "@/components/user/flow-types";

import { useWorkspaceController } from "@/components/user/use-workspace-controller";

import { useSmartWalletDisplay } from "@/providers/smart-wallet-display";

import { useWalletContext } from "@/providers/wallet-provider";
import { useAtom, useSetAtom, useStore, useAtomValue } from "jotai";
import {
  activeBuildAtom, activeSubmitAtom, buildErrorAtom, buildErrorDetailsAtom, submitHashAtom,
  mintConfirmationAtom, mintCelebrationAtom, dismissedSubmitHashAtom, previewAtom,
  previewSignatureAtom, lastActionLabelAtom, resetAllFlowAtom, mintConfirmationRunAtom,
  mintedWalletNameAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { resetWorkspaceUiAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { resetAllFormsAtom } from "@/components/user/workspace/atoms/forms/reset-all-forms.atom";
import { configAtom, resetConfigAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { connectStepPinnedAtom, guidedOverviewSectionAtom, renderNowMsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import {
  existingWalletNamesAtom,
  suggestedMintWalletNameAtom,
  autoMintStateFormAtom
} from "@/components/user/workspace/atoms/workspace-mint-defaults.atoms";
import {
  selectedDetectedTokenUnitAtom,
  userFlowBranchAtom,
  wizardSelectedActionAtom,
  selectedActionAtom,
  effectiveSttActionAtom,
  wizardStepAtom,
  selectedIntentAtom,
  selectedTaskAtom,
  resolvedSelectedTaskAtom
} from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { useMintForm } from "@/components/user/workspace/forms/use-mint-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { mapLegacyWizardStepToFlowStep, resolveIntentForAction } from "@/components/user/workspace/helpers";
import { useSharedSttReference } from "@/components/user/workspace/use-shared-stt-reference";
import { useDetectedSttTokens } from "@/components/user/workspace/use-detected-stt-tokens";
import { useLockedContractUtxos } from "@/components/user/workspace/use-locked-contract-utxos";
import { useCopyFeedback } from "@/components/user/workspace/use-copy-feedback";
import { useWalletBalance } from "@/components/user/workspace/use-wallet-balance";
import { useRecentRecipients } from "@/components/user/workspace/use-recent-recipients";

/**
 * The workspace FOUNDATION layer: wallet context, the atom-backed forms + build/submit state,
 * refs, URL route state, the data hooks (detected tokens, wallet balance/activity, locked utxos),
 * and the small base derivations/callbacks everything else builds on. Returns the base slice the
 * controller spreads to the derivation/handler/effect phases and the view context.
 */
export function useWorkspaceFoundation() {
  const {
    activeAddress,
    activeRewardAddress,
    activeWallet,
    activeWalletName,
    activePaymentKeyHash,
    isDemoWallet,
    networkId
  } = useWalletContext();

  // Subscribe to config (not the value, just the setter) so the controller re-renders on
  // config change — this keeps the transaction builders' render-time config snapshot current.
  const [, setConfig] = useAtom(configAtom);
  // Seed the mount-time display clock atom (renderNowMsAtom) once; transfer derivations + views
  // read it from the atom. Defaults to 0 pre-mount to avoid an SSR hydration mismatch.
  const setRenderNowMs = useSetAtom(renderNowMsAtom);
  useEffect(() => {
    setRenderNowMs(Date.now());
  }, [setRenderNowMs]);
  const setConnectStepPinned = useSetAtom(connectStepPinnedAtom);
  const {
    refreshSharedSttReferenceStore,
    createInlineSharedReference,
    resetSharedReferencePreview
  } = useSharedSttReference({ activeWallet, isDemoWallet });
  const sharedSttReferenceStore = useAtomValue(sharedSttReferenceStoreAtom);
  const sharedSttReferenceStoreLoading = useAtomValue(sharedSttReferenceStoreLoadingAtom);
  const { rememberRecipient, rememberRecipients } = useRecentRecipients();
  const { copyTextToClipboard } = useCopyFeedback();
  const smartWalletDisplay = useSmartWalletDisplay();
  const [guidedOverviewSection, setGuidedOverviewSection] = useAtom(guidedOverviewSectionAtom);
  const mintForm = useMintForm();
  const {
    mintStateForm,
    previousAutoMintStateRef,
    pendingOrphanWalletInputsRef,
  } = mintForm;

  const sttForm = useSttSpendForm();
  const {
    sttWalletInputs,
    setSttWalletInputs,
    sttExtraTransfers,
    selectedSttAction,
    sttAuthorityPath,
    setSttAuthorityPath,
    walletOperatorPath,
    setWalletOperatorPath
  } = sttForm;

  const { refreshLockedContractUtxos } = useLockedContractUtxos();
  const lockedContractUtxos = useAtomValue(lockedContractUtxosAtom);
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);

  const [activeBuild, setActiveBuild] = useAtom(activeBuildAtom);
  const [activeSubmit, setActiveSubmit] = useAtom(activeSubmitAtom);
  const [buildError, setBuildError] = useAtom(buildErrorAtom);
  const [buildErrorDetails, setBuildErrorDetails] = useAtom(buildErrorDetailsAtom);
  const [submitHash, setSubmitHash] = useAtom(submitHashAtom);
  const [mintConfirmation, setMintConfirmation] = useAtom(mintConfirmationAtom);
  // Celebration shown once the mint confirms — captured independently of the
  // confirmation polling / navigation so it persists as the final stop.
  const [mintCelebration, setMintCelebration] = useAtom(mintCelebrationAtom);
  const mintCelebrationRef = useRef<string | null>(null);
  // Wallet name as it was at mint-submit time. The live mintStateForm.walletName
  // can auto-increment to the next default (e.g. "Smart wallet 5" → "6") when the
  // wallet list refreshes mid-confirmation, so the celebration must read this
  // snapshot — not the live form value — to show the name actually minted.
  const [mintedWalletName, setMintedWalletName] = useAtom(mintedWalletNameAtom);
  // Timers for the staggered post-submit refresh (deposit/send/admin). The
  // immediate refresh after a submit runs before the tx confirms, so we re-poll
  // a few times so the balance/UTxOs update on their own once the tx lands.
  const postSubmitRefreshTimersRef = useRef<number[]>([]);
  // The progress overlay can be dismissed (Esc/X) without cancelling the mint.
  // Keyed by the submission it was dismissed for, so a fresh submit (new
  // submitHash) re-shows it during render — no effect needed.
  const [dismissedSubmitHash, setDismissedSubmitHash] = useAtom(dismissedSubmitHashAtom);
  const [preview, setPreview] = useAtom(previewAtom);
  const [previewSignature, setPreviewSignature] = useAtom(previewSignatureAtom);
  const [lastActionLabel, setLastActionLabel] = useAtom(lastActionLabelAtom);
  const jotaiStore = useStore();
  const resetWorkspaceFlow = useSetAtom(resetAllFlowAtom);
  const resetWorkspaceUi = useSetAtom(resetWorkspaceUiAtom);
  const resetAllForms = useSetAtom(resetAllFormsAtom);
  const resetConfig = useSetAtom(resetConfigAtom);
  // Flow + UI + form atoms are module-global; reset them on unmount so each fresh mount
  // starts clean (mirrors component-local useState's per-mount reset).
  useEffect(() => {
    return () => {
      resetWorkspaceFlow();
      resetWorkspaceUi();
      resetAllForms();
      resetConfig();
    };
  }, [resetWorkspaceFlow, resetWorkspaceUi, resetAllForms, resetConfig]);

  const clearBuildMessages = useCallback(() => {
    setBuildError(null);
    setBuildErrorDetails(null);
    setSubmitHash(null);
    setMintConfirmation(null);
    jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
  }, [jotaiStore, setBuildError, setBuildErrorDetails, setSubmitHash, setMintConfirmation]);

  const clearPreviewResult = useCallback(() => {
    setPreview(null);
    setPreviewSignature(null);
    setLastActionLabel("");
  }, [setPreview, setPreviewSignature, setLastActionLabel]);
  const walletSessionKeyRef = useRef<string | null>(null);
  const actionConfigurationRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  // Captured on each supported build so the "Save as multi-sig proposal" action
  // can stash the exact builder inputs (for rebuild) without scattering state.
  const proposalCaptureRef = useRef<ProposalCapture | null>(null);
  // Synchronous re-entry guard for transaction submission. `activeSubmit`
  // (state) drives button disabling, but React batches state updates so a
  // rapid double-click can pass the disabled check before the re-render.
  // The ref flips synchronously and blocks the second invocation.
  const submitInFlightRef = useRef(false);
  const walletReady = Boolean(activeWallet && networkId === 0);
  const { refreshWalletBalance } = useWalletBalance(
    activeWallet,
    walletReady
  );

  const {
    routeState,
    setupCheckpoint,
    dispatch: dispatchWorkspaceAction,
    commitRouteState
  } =
    useWorkspaceController({
      checkpointInput: {
        walletReady,
        networkId,
        sharedReferenceStatus: sharedSttReferenceStoreLoading
          ? "loading"
          : sharedSttReferenceStore?.status ?? "missing",
        lockedUtxoCount: lockedContractUtxos.length,
        lockedUtxosLoading: lockedContractUtxosLoading
      }
    });

  useEffect(() => {
    return () => {
      jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
    };
  }, [, jotaiStore]);

  // Mirror the URL-parsed route state into routeStateAtom so the selection derived atoms
  // (workspace-selection.atoms.ts) and any view can read it without useSearchParams. The URL
  // stays the source of truth; mutations go through dispatch/commitRouteState.
  const setRouteStateAtom = useSetAtom(routeStateAtom);
  useEffect(() => {
    setRouteStateAtom(routeState);
  }, [routeState, setRouteStateAtom]);

  // Selection state (which wallet / action / task / flow-step) is now a derived-atom projection of
  // the URL route state; see workspace-selection.atoms.ts. Read directly so downstream derivation
  // atoms and views read the same atoms instead of receiving these threaded through the barrel.
  const selectedDetectedTokenUnit = useAtomValue(selectedDetectedTokenUnitAtom);
  const userFlowBranch = useAtomValue(userFlowBranchAtom);
  const wizardSelectedAction = useAtomValue(wizardSelectedActionAtom);
  const selectedAction = useAtomValue(selectedActionAtom);
  const effectiveSttAction = useAtomValue(effectiveSttActionAtom);
  const wizardStep = useAtomValue(wizardStepAtom);
  const selectedIntent = useAtomValue(selectedIntentAtom);
  const selectedTask = useAtomValue(selectedTaskAtom);
  const resolvedSelectedTask = useAtomValue(resolvedSelectedTaskAtom);

  const setSelectedDetectedTokenUnit = useCallback(
    (nextUnit: string) => {
      if (!nextUnit.trim()) {
        dispatchWorkspaceAction({ type: "clear-selected-wallet" });
        return;
      }

      dispatchWorkspaceAction({
        type: "select-wallet",
        walletUnit: nextUnit
      });
    },
    [dispatchWorkspaceAction]
  );

  const {
    refreshDetectedTokens,
    refreshPermissionWalletSummaries
  } = useDetectedSttTokens({
    selectedDetectedTokenUnit,
    setSelectedDetectedTokenUnit
  });

  const setWizardStep = useCallback(
    (nextStep: UserWizardStep) => {
      dispatchWorkspaceAction({
        type: "set-step",
        flowStep: mapLegacyWizardStepToFlowStep(nextStep)
      });
    },
    [dispatchWorkspaceAction]
  );

  const setWizardSelectedAction = useCallback(
    (nextAction: UserActionKind | null) => {
      if (!nextAction) {
        dispatchWorkspaceAction({ type: "clear-selected-action" });
        return;
      }

      dispatchWorkspaceAction({
        type: "select-workspace-action",
        intent: resolveIntentForAction(nextAction, selectedIntent),
        action: nextAction,
        flowStep: routeState.flowStep === "review" ? "review" : "configure"
      });
    },
    [dispatchWorkspaceAction, routeState.flowStep, selectedIntent]
  );

  // Mint-flow defaults are derived atoms now (workspace-mint-defaults.atoms.ts).
  const existingWalletNames = useAtomValue(existingWalletNamesAtom);
  const suggestedMintWalletName = useAtomValue(suggestedMintWalletNameAtom);
  const autoMintStateForm = useAtomValue(autoMintStateFormAtom);

  return {
    activeAddress,
    activeRewardAddress,
    activeWallet,
    activeWalletName,
    activePaymentKeyHash,
    isDemoWallet,
    networkId,
    setConnectStepPinned,
    refreshSharedSttReferenceStore,
    createInlineSharedReference,
    resetSharedReferencePreview,
    rememberRecipient,
    rememberRecipients,
    copyTextToClipboard,
    smartWalletDisplay,
    guidedOverviewSection,
    setGuidedOverviewSection,
    mintForm,
    mintStateForm,
    previousAutoMintStateRef,
    pendingOrphanWalletInputsRef,
    sttForm,
    sttWalletInputs,
    setSttWalletInputs,
    sttExtraTransfers,
    selectedSttAction,
    sttAuthorityPath,
    setSttAuthorityPath,
    walletOperatorPath,
    setWalletOperatorPath,
    refreshLockedContractUtxos,
    activeBuild,
    setActiveBuild,
    activeSubmit,
    setActiveSubmit,
    buildError,
    setBuildError,
    buildErrorDetails,
    setBuildErrorDetails,
    submitHash,
    setSubmitHash,
    mintConfirmation,
    setMintConfirmation,
    mintCelebration,
    setMintCelebration,
    mintCelebrationRef,
    mintedWalletName,
    setMintedWalletName,
    postSubmitRefreshTimersRef,
    dismissedSubmitHash,
    setDismissedSubmitHash,
    preview,
    setPreview,
    previewSignature,
    setPreviewSignature,
    lastActionLabel,
    setLastActionLabel,
    jotaiStore,
    resetWorkspaceFlow,
    resetWorkspaceUi,
    resetAllForms,
    resetConfig,
    clearBuildMessages,
    clearPreviewResult,
    walletSessionKeyRef,
    actionConfigurationRef,
    router,
    proposalCaptureRef,
    submitInFlightRef,
    walletReady,
    refreshWalletBalance,
    routeState,
    setupCheckpoint,
    setConfig,
    dispatchWorkspaceAction,
    commitRouteState,
    selectedDetectedTokenUnit,
    userFlowBranch,
    wizardSelectedAction,
    selectedAction,
    effectiveSttAction,
    wizardStep,
    selectedIntent,
    selectedTask,
    resolvedSelectedTask,
    setSelectedDetectedTokenUnit,
    refreshDetectedTokens,
    refreshPermissionWalletSummaries,
    setWizardStep,
    setWizardSelectedAction,
    existingWalletNames,
    suggestedMintWalletName,
    autoMintStateForm
  };
}
