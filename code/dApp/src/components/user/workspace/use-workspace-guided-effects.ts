"use client";
import { guidedOverviewSectionAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { useSetAtom } from "jotai";

import { useEffect } from "react";

import type {
  UserActionKind,
  UserWorkspaceTask
} from "@/components/user/flow-types";

import { type useWorkspaceGuidedDerivations } from "@/components/user/workspace/use-workspace-guided-derivations";

import { type MutableRefObject } from "react";

/**
 * The guided-overview / composer sync effects, extracted from the controller hook. They
 * reset the guided overview section to "home" when no token is selected, and keep the active
 * composer / focused-task selection consistent with the resolved task. UI state only; no
 * signing. A hook (owns useEffect), called once from the controller.
 */
export interface WorkspaceGuidedEffectsCtx {
  actionConfigurationRef: MutableRefObject<HTMLDivElement | null>;
  hasActiveComposer: ReturnType<typeof useWorkspaceGuidedDerivations>["hasActiveComposer"];
  resolvedSelectedTask: UserWorkspaceTask | null;
  selectedAction: UserActionKind;
  selectedDetectedTokenUnit: string;
}

export function useWorkspaceGuidedEffects(ctx: WorkspaceGuidedEffectsCtx): void {
  const {
    actionConfigurationRef,
    hasActiveComposer,
    resolvedSelectedTask,
    selectedAction,
    selectedDetectedTokenUnit
  } = ctx;
  const setGuidedOverviewSection = useSetAtom(guidedOverviewSectionAtom);

  useEffect(() => {
    // Reset the guided overview to home whenever no token is selected.
    if (!selectedDetectedTokenUnit) {

      setGuidedOverviewSection("home");
    }
  }, [selectedDetectedTokenUnit, setGuidedOverviewSection]);

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
