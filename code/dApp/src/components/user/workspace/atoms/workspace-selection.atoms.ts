"use client";

import { atom } from "jotai";
import type {
  UserFlowBranch,
  UserWorkspaceTask
} from "@/components/user/flow-types";
import type { SttSpendActionMode } from "@/components/user/workspace/types";
import {
  isPeopleTask,
  isSttFlowAction,
  isStreamingPaymentTask,
  isWalletSettingsTask,
  mapFlowStepToLegacyWizardStep
} from "@/components/user/workspace/helpers";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { walletReadyAtom } from "@/providers/wallet.atoms";
import { selectedSttActionAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";

/**
 * The workspace SELECTION state — which wallet / action / task / flow-step is active — as derived
 * atoms over the URL route state ([[routeStateAtom]]), the connected wallet ([[walletReadyAtom]]),
 * and the STT-spend form's fallback action. These used to be `useMemo`/const derivations inside the
 * foundation hook, threaded through the controller's return barrel; as derived atoms the downstream
 * derivation atoms and any view read them directly via `useAtomValue`.
 *
 * Read-only: mutations go through the route reducer (`dispatch` / `commitRouteState`) which writes
 * the URL; this graph recomputes from `routeStateAtom` once the route sync mirrors the new URL.
 */
export const selectedDetectedTokenUnitAtom = atom(
  (get) => get(routeStateAtom).selectedWalletUnit ?? ""
);

export const userFlowBranchAtom = atom<UserFlowBranch | null>((get) => {
  const mode = get(routeStateAtom).workspaceMode;
  if (mode === "new-wallet") return "new-wallet";
  if (mode === "existing-wallet") return "existing-token";
  return null;
});

/** The raw route action (may be null — distinct from the resolved default below). */
export const wizardSelectedActionAtom = atom((get) => get(routeStateAtom).selectedAction);

/** The resolved action: the route action, or the mode default (mint for new-wallet, else use). */
export const selectedActionAtom = atom((get) => {
  const routeState = get(routeStateAtom);
  return (
    routeState.selectedAction ??
    (routeState.workspaceMode === "new-wallet" ? "mint" : "use")
  );
});

export const effectiveSttActionAtom = atom<SttSpendActionMode>((get) => {
  const selectedAction = get(selectedActionAtom);
  return isSttFlowAction(selectedAction)
    ? selectedAction
    : get(selectedSttActionAtom);
});

export const wizardStepAtom = atom((get) => {
  const routeState = get(routeStateAtom);
  return mapFlowStepToLegacyWizardStep(
    routeState.flowStep,
    Boolean(routeState.selectedWalletUnit),
    get(walletReadyAtom)
  );
});

export const selectedIntentAtom = atom((get) => get(routeStateAtom).selectedIntent);
export const selectedTaskAtom = atom((get) => get(routeStateAtom).selectedTask);

export const resolvedSelectedTaskAtom = atom<UserWorkspaceTask | null>((get) => {
  const selectedIntent = get(selectedIntentAtom);
  const selectedTask = get(selectedTaskAtom);

  if (selectedIntent === "manage-people") {
    return isPeopleTask(selectedTask) ? selectedTask : "people-admins-signers";
  }
  if (selectedIntent === "wallet-settings") {
    return isWalletSettingsTask(selectedTask) ? selectedTask : "settings-wallet-name";
  }
  if (selectedIntent === "manage-streaming-payments") {
    return isStreamingPaymentTask(selectedTask) &&
      selectedTask !== "streaming-payments-pay-due"
      ? selectedTask
      : "streaming-payments-edit-renew";
  }
  if (selectedIntent === "pay-streaming-payments") {
    return "streaming-payments-pay-due";
  }
  return selectedTask;
});
