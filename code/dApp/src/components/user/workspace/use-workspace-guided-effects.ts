"use client";

import { useEffect } from "react";

import type {
  UserActionKind,
  UserWorkspaceTask
} from "@/components/user/flow-types";

import { type useWorkspaceGuidedDerivations } from "@/components/user/workspace/use-workspace-guided-derivations";

import { type MutableRefObject } from "react";

/**
 * The composer sync effects, extracted from the controller hook. They keep the active
 * composer / focused-task selection consistent with the resolved task. UI state only; no
 * signing. A hook (owns useEffect), called once from the controller.
 */
export interface WorkspaceGuidedEffectsCtx {
  actionConfigurationRef: MutableRefObject<HTMLDivElement | null>;
  hasActiveComposer: ReturnType<typeof useWorkspaceGuidedDerivations>["hasActiveComposer"];
  resolvedSelectedTask: UserWorkspaceTask | null;
  selectedAction: UserActionKind;
}

export function useWorkspaceGuidedEffects(ctx: WorkspaceGuidedEffectsCtx): void {
  const {
    actionConfigurationRef,
    hasActiveComposer,
    resolvedSelectedTask,
    selectedAction
  } = ctx;
  // The "reset the overview to home when no token is selected" effect is gone, and with it
  // the `selectedDetectedTokenUnit` this hook needed. The overview section now lives in
  // `?view=`, and `buildWorkspaceSearchParams` only writes that param behind a chosen
  // wallet, so dropping the wallet drops the section with it.

  useEffect(() => {
    if (!hasActiveComposer) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const firstField = actionConfigurationRef.current?.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])");
      firstField?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [hasActiveComposer, resolvedSelectedTask, selectedAction, actionConfigurationRef]);
}
