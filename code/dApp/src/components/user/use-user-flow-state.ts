"use client";

import { useMemo } from "react";
import { buildGuidedActionDrafts, getPrimaryBlockingIssue, type GuidedActionDraftContext } from "@/components/user/guided-action-adapters";
import {
  buildSetupReadinessIssues,
  USER_ACTION_DEFINITION_MAP,
  USER_ACTION_DEFINITIONS
} from "@/components/user/flow-config";
import type {
  ActionDraftMap,
  FieldErrors,
  ReadinessIssue,
  SetupState,
  UserActionKind
} from "@/components/user/flow-types";
import type { BuildResult } from "@/lib/types/contracts";

type UseUserFlowStateInput = {
  setupState: SetupState;
  actionFieldErrorsMap: Record<UserActionKind, FieldErrors>;
  selectedAction: UserActionKind;
  preview: BuildResult | null;
  previewSignature: string | null;
  lastActionLabel: string;
  getBuildActionSignature: (action: UserActionKind) => string;
  draftContext: Omit<GuidedActionDraftContext, "actionReadinessMap">;
};

export function useUserFlowState({
  setupState,
  actionFieldErrorsMap,
  selectedAction,
  preview,
  previewSignature,
  lastActionLabel,
  getBuildActionSignature,
  draftContext
}: UseUserFlowStateInput) {
  const setupReadinessIssues = useMemo(
    () => buildSetupReadinessIssues(setupState),
    [setupState]
  );

  const setupReadinessByKey = useMemo(
    () =>
      Object.fromEntries(
        setupReadinessIssues.map((issue) => [issue.key ?? issue.id, issue])
      ) as Record<string, ReadinessIssue>,
    [setupReadinessIssues]
  );

  const actionReadinessMap = useMemo<Record<UserActionKind, ReadinessIssue[]>>(
    () =>
      USER_ACTION_DEFINITIONS.reduce(
        (accumulator, definition) => {
          const prerequisiteIssues = definition.prerequisites
            .map((key) => setupReadinessByKey[key])
            .filter((issue): issue is ReadinessIssue => Boolean(issue));
          const fieldIssues = Object.entries(actionFieldErrorsMap[definition.kind]).flatMap(
            ([label, messages], index) =>
              messages.map((message, messageIndex) => ({
                id: `${definition.kind}-${index}-${messageIndex}`,
                label,
                description: message,
                status: "error" as const,
                blocking: true
              }))
          );

          accumulator[definition.kind] = [...prerequisiteIssues, ...fieldIssues];
          return accumulator;
        },
        {} as Record<UserActionKind, ReadinessIssue[]>
      ),
    [actionFieldErrorsMap, setupReadinessByKey]
  );

  const actionDrafts = useMemo<ActionDraftMap>(
    () => buildGuidedActionDrafts({ ...draftContext, actionReadinessMap }),
    [actionReadinessMap, draftContext]
  );

  const activeFieldErrors = actionFieldErrorsMap[selectedAction];
  const activeReadinessIssues = actionReadinessMap[selectedAction];
  const activeActionDraft = actionDrafts[selectedAction];
  const previewMatchesSelectedAction = Boolean(
    preview &&
      lastActionLabel === selectedAction &&
      previewSignature === getBuildActionSignature(selectedAction)
  );

  const activeActionDefinition = USER_ACTION_DEFINITION_MAP[selectedAction];
  const activeSetupReadinessIssues = activeActionDefinition.prerequisites
    .map((key) => setupReadinessByKey[key])
    .filter((issue): issue is ReadinessIssue => Boolean(issue));
  const lastActionDisplayLabel =
    lastActionLabel && lastActionLabel in USER_ACTION_DEFINITION_MAP
      ? USER_ACTION_DEFINITION_MAP[lastActionLabel as UserActionKind].label
      : lastActionLabel;

  return {
    setupReadinessIssues,
    actionReadinessMap,
    actionDrafts,
    activeActionDraft,
    activeFieldErrors,
    activeReadinessIssues,
    activeActionDefinition,
    activeSetupReadinessIssues,
    previewMatchesSelectedAction,
    lastActionDisplayLabel,
    primarySetupIssue: getPrimaryBlockingIssue(activeSetupReadinessIssues),
    primaryActionIssue: getPrimaryBlockingIssue(activeReadinessIssues)
  };
}
