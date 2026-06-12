"use client";
import { connectStepPinnedAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { useAtomValue } from "jotai";

import { useEffect } from "react";

import type {
  UserActionKind,
  UserFlowBranch,
  UserWizardStep
} from "@/components/user/flow-types";

import { type useWorkspaceController } from "@/components/user/use-workspace-controller";

import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";

import { type mapFlowStepToLegacyWizardStep } from "@/components/user/workspace/helpers";

/**
 * The wizard / route-step sync effects, extracted from the controller hook. They keep the
 * legacy wizard step + selected-action in sync with the resolved route/flow state (reset to a
 * sensible step when the wallet connects, clamp the selected action to the selectable set).
 * Route/UI state only; no signing. A hook (owns useEffect), called once from the controller.
 */
export interface WorkspaceWizardEffectsCtx {
  clearBuildMessages: () => void;
  clearPreviewResult: () => void;
  selectableWizardActionKinds: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectableWizardActionKinds"];
  selectedDetectedToken: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedToken"];
  setWizardSelectedAction: (nextAction: UserActionKind | null) => void;
  setWizardStep: (nextStep: UserWizardStep) => void;
  userFlowBranch: UserFlowBranch | null;
  walletReady: boolean;
  wizardSelectedAction: ReturnType<typeof useWorkspaceController>["routeState"]["selectedAction"];
  wizardStep: ReturnType<typeof mapFlowStepToLegacyWizardStep>;
}

export function useWorkspaceWizardEffects(ctx: WorkspaceWizardEffectsCtx): void {
  const {
    clearBuildMessages,
    clearPreviewResult,
    selectableWizardActionKinds,
    selectedDetectedToken,
    setWizardSelectedAction,
    setWizardStep,
    userFlowBranch,
    walletReady,
    wizardSelectedAction,
    wizardStep
  } = ctx;
  const connectStepPinned = useAtomValue(connectStepPinnedAtom);

  useEffect(() => {
    if (!walletReady) {
      if (wizardStep !== "connect") {
        setWizardStep("connect");
      }
      return;
    }

    if (!userFlowBranch) {
      if (wizardStep === "connect" && !connectStepPinned) {
        setWizardStep("source");
      }
      return;
    }

    if (userFlowBranch === "existing-token" && !selectedDetectedToken) {
      if (wizardStep !== "source") {
        setWizardStep("source");
      }
      return;
    }

    if (userFlowBranch === "existing-token" && !wizardSelectedAction) {
      if (wizardStep !== "source" && wizardStep !== "action") {
        setWizardStep("action");
      }
      return;
    }
  }, [
    selectedDetectedToken,
    connectStepPinned,
    setWizardStep,
    userFlowBranch,
    walletReady,
    wizardSelectedAction,
    wizardStep
  ]);

  useEffect(() => {
    if (
      userFlowBranch === "existing-token" &&
      wizardSelectedAction &&
      !selectableWizardActionKinds.has(wizardSelectedAction)
    ) {
      setWizardSelectedAction(null);
      setWizardStep(selectedDetectedToken ? "action" : "source");
      clearPreviewResult();
      clearBuildMessages();
    }
  }, [
    selectedDetectedToken,
    selectableWizardActionKinds,
    setWizardSelectedAction,
    setWizardStep,
    userFlowBranch,
    wizardSelectedAction,
      clearBuildMessages,
      clearPreviewResult
  ]);
}
