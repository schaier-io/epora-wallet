"use client";

import { useMemo, useState } from "react";
import { buildGuidedActionDrafts, getPrimaryBlockingIssue, type GuidedActionDraftContext } from "@/components/user/guided-action-adapters";
import {
  USER_ACTION_DEFINITION_MAP,
  USER_ACTION_DEFINITIONS
} from "@/lib/user-flow/action-definitions";
import { buildSetupReadinessIssues } from "@/lib/user-flow/setup-readiness";
import type {
  ActionDraftMap,
  FieldErrors,
  ReadinessIssue,
  SetupState,
  UserActionKind
} from "@/components/user/flow-types";
import type { BuildResult } from "@/lib/types/contracts";

/** Stable empty map, so the gated value below keeps a stable identity between renders. */
const NO_FIELD_ERRORS: FieldErrors = {};

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

  // Display gate for field validation. `activeFieldErrors` is a pure derivation of the
  // draft, so an action the user had only just opened arrived with every "required"
  // message already on screen: rose border, inline message and attention panel, before a
  // single keystroke.
  //
  // This suppresses the DISPLAY of those messages only. `activeFieldErrors` and
  // `activeReadinessIssues` keep their raw values, and the build gate, the primary CTA and
  // the approval CTA keep reading those. A pristine invalid draft must stay un-buildable,
  // because the builders assume the validator already ran: an empty vote reaches Mesh's
  // `addBasicVote` as a raw TypeError (see `action-validation-shared.ts`).
  //
  // "Touched" is the per-action form fingerprint the preview comparison already uses, held
  // against the fingerprint captured when this action became the selected one. It is a
  // comparison and not a latch, so clearing the form back to how it opened hides the
  // messages again, and switching actions re-captures the fingerprint, so one action's
  // touched state can never carry onto another. A value that settles asynchronously (a
  // state form seeded from chain) also reads as a change: that reveals the messages early,
  // which is exactly the old behaviour, and never the reverse.
  const selectedActionSignature = getBuildActionSignature(selectedAction);
  // React's own "adjust state while rendering" pattern, not an effect: the captured
  // fingerprint has to be right in the same render that switches action, or the new
  // action's first paint would compare against the old action's fingerprint and open
  // accusing. The `action` check below keeps the one transitional render (the state is
  // still stale there) on the hidden side, which is the safe side.
  const [pristineSignature, setPristineSignature] = useState({
    action: selectedAction,
    signature: selectedActionSignature
  });
  if (pristineSignature.action !== selectedAction) {
    setPristineSignature({ action: selectedAction, signature: selectedActionSignature });
  }
  const fieldErrorsVisible =
    pristineSignature.action === selectedAction &&
    pristineSignature.signature !== selectedActionSignature;
  const visibleFieldErrors = fieldErrorsVisible ? activeFieldErrors : NO_FIELD_ERRORS;
  // The readiness list is prerequisite issues followed by one issue per field error, so
  // hiding the field half leaves exactly the prerequisites -- which is what
  // `activeSetupReadinessIssues` already is.
  const visibleReadinessIssues = fieldErrorsVisible
    ? activeReadinessIssues
    : activeSetupReadinessIssues;

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
    visibleFieldErrors,
    visibleReadinessIssues,
    activeActionDefinition,
    activeSetupReadinessIssues,
    previewMatchesSelectedAction,
    lastActionDisplayLabel,
    primarySetupIssue: getPrimaryBlockingIssue(activeSetupReadinessIssues)
  };
}
