import { USER_ACTION_DEFINITION_MAP } from "@/components/user/flow-config";
import type {
  ReadinessKey,
  SetupCheckpoint,
  UserActionKind,
  UserFlowStep,
  UserWorkspaceIntent,
  UserWorkspaceMode,
  UserWorkspaceTask,
  UserWorkspaceRouteState
} from "@/components/user/flow-types";

export type WorkspaceControllerAction =
  | { type: "open-landing" }
  | { type: "start-create-wallet" }
  | { type: "select-wallet"; walletUnit: string }
  | {
      type: "select-workspace-action";
      intent: UserWorkspaceIntent;
      action: UserActionKind | null;
      task?: UserWorkspaceTask | null;
      flowStep?: UserFlowStep;
    }
  | { type: "set-step"; flowStep: UserFlowStep }
  | { type: "set-task"; task: UserWorkspaceTask | null }
  | { type: "clear-selected-action" }
  | { type: "clear-selected-wallet" };

export type SetupCheckpointInput = {
  walletReady: boolean;
  networkId: number | null;
  selectedAction: UserActionKind | null;
  sharedReferenceStatus: "loading" | "missing" | "ready";
  lockedUtxoCount: number;
  lockedUtxosLoading: boolean;
};

const FLOW_STEP_VALUES = new Set<UserFlowStep>(["overview", "configure", "review"]);
const WORKSPACE_INTENT_VALUES = new Set<UserWorkspaceIntent>([
  "create-wallet",
  "send",
  "add-funds",
  "manage-people",
  "wallet-settings",
  "pay-streaming-payments",
  "manage-streaming-payments",
  "rewards",
  "enable-staking",
  "governance-publish",
  "governance-vote",
  "consolidate",
  "manual-tools"
]);
const WORKSPACE_TASK_VALUES = new Set<UserWorkspaceTask>([
  "people-admins-signers",
  "people-spending-users",
  "people-wallet-assignments",
  "settings-wallet-name",
  "settings-beneficiaries",
  "settings-proof-of-life",
  "settings-multisig-threshold",
  "streaming-payments-add",
  "streaming-payments-edit-renew",
  "streaming-payments-pay-due"
]);

export const DEFAULT_WORKSPACE_ROUTE_STATE: UserWorkspaceRouteState = {
  workspaceMode: "landing",
  selectedWalletUnit: null,
  selectedAction: null,
  selectedIntent: null,
  selectedTask: null,
  flowStep: "overview"
};

function isUserFlowStep(value: string | null): value is UserFlowStep {
  return Boolean(value && FLOW_STEP_VALUES.has(value as UserFlowStep));
}

function isUserWorkspaceIntent(value: string | null): value is UserWorkspaceIntent {
  return Boolean(value && WORKSPACE_INTENT_VALUES.has(value as UserWorkspaceIntent));
}

function isUserWorkspaceTask(value: string | null): value is UserWorkspaceTask {
  return Boolean(value && WORKSPACE_TASK_VALUES.has(value as UserWorkspaceTask));
}

function isUserActionKind(value: string | null): value is UserActionKind {
  return Boolean(value && value in USER_ACTION_DEFINITION_MAP);
}

export function mapActionKindToIntent(action: UserActionKind): UserWorkspaceIntent {
  switch (action) {
    case "mint":
      return "create-wallet";
    case "use":
    case "use-allowance":
    case "use-beneficiary":
      return "send";
    case "lock-funds":
      return "add-funds";
    case "update-state":
      return "manage-people";
    case "manage-streaming-payments":
      return "manage-streaming-payments";
    case "payout-streaming-payment":
      return "pay-streaming-payments";
    case "wallet-withdraw":
      return "rewards";
    case "set-intended-stake-credential":
      return "enable-staking";
    case "wallet-publish":
      return "governance-publish";
    case "wallet-vote":
      return "governance-vote";
    case "consolidate-utxo":
      return "consolidate";
    case "wallet-spend":
    case "renew-proof-of-life":
      return "manual-tools";
  }
}

function mapIntentToDefaultAction(intent: UserWorkspaceIntent): UserActionKind | null {
  switch (intent) {
    case "create-wallet":
      return "mint";
    case "send":
      return "use";
    case "add-funds":
      return "lock-funds";
    case "manage-people":
    case "wallet-settings":
      return "update-state";
    case "pay-streaming-payments":
      return "payout-streaming-payment";
    case "manage-streaming-payments":
      return "manage-streaming-payments";
    case "rewards":
      return "wallet-withdraw";
    case "enable-staking":
      return "set-intended-stake-credential";
    case "governance-publish":
      return "wallet-publish";
    case "governance-vote":
      return "wallet-vote";
    case "consolidate":
      return "consolidate-utxo";
    case "manual-tools":
      return "wallet-spend";
  }
}

function mapIntentToDefaultTask(intent: UserWorkspaceIntent): UserWorkspaceTask | null {
  switch (intent) {
    case "manage-people":
      return "people-admins-signers";
    case "wallet-settings":
      return "settings-wallet-name";
    case "manage-streaming-payments":
      return "streaming-payments-edit-renew";
    case "pay-streaming-payments":
      return "streaming-payments-pay-due";
    default:
      return null;
  }
}

function resolveWorkspaceMode(
  intent: UserWorkspaceIntent | null,
  walletUnit: string | null
): UserWorkspaceMode {
  if (intent === "create-wallet") {
    return "new-wallet";
  }

  if (walletUnit) {
    return "existing-wallet";
  }

  return "landing";
}

type SearchParamReader = Pick<URLSearchParams, "get">;

export function parseWorkspaceRouteState(searchParams: SearchParamReader) {
  const selectedWalletUnit = searchParams.get("wallet");
  const actionParam = searchParams.get("action");
  const selectedIntent = isUserWorkspaceIntent(actionParam)
    ? actionParam
    : isUserActionKind(actionParam)
      ? mapActionKindToIntent(actionParam)
      : null;
  const selectedAction = isUserActionKind(actionParam)
    ? actionParam
    : selectedIntent
      ? mapIntentToDefaultAction(selectedIntent)
      : null;
  const selectedTask = isUserWorkspaceTask(searchParams.get("task"))
    ? (searchParams.get("task") as UserWorkspaceTask)
    : selectedIntent
      ? mapIntentToDefaultTask(selectedIntent)
      : null;
  const flowStep = isUserFlowStep(searchParams.get("step"))
    ? (searchParams.get("step") as UserFlowStep)
    : selectedIntent
      ? "configure"
      : selectedWalletUnit
        ? "overview"
        : "overview";

  return {
    workspaceMode: resolveWorkspaceMode(selectedIntent, selectedWalletUnit),
    selectedWalletUnit,
    selectedAction,
    selectedIntent,
    selectedTask,
    flowStep
  } satisfies UserWorkspaceRouteState;
}

export function buildWorkspaceSearchParams(state: UserWorkspaceRouteState) {
  const params = new URLSearchParams();

  if (state.selectedWalletUnit) {
    params.set("wallet", state.selectedWalletUnit);
  }

  if (state.selectedIntent) {
    params.set("action", state.selectedIntent);
  } else if (state.selectedAction) {
    params.set("action", state.selectedAction);
  }

  if (state.selectedTask) {
    params.set("task", state.selectedTask);
  }

  if (state.flowStep !== "overview" || state.selectedIntent || state.selectedWalletUnit) {
    params.set("step", state.flowStep);
  }

  return params;
}

export function reduceWorkspaceRouteState(
  state: UserWorkspaceRouteState,
  action: WorkspaceControllerAction
): UserWorkspaceRouteState {
  switch (action.type) {
    case "open-landing":
      return DEFAULT_WORKSPACE_ROUTE_STATE;
    case "start-create-wallet":
      return {
        workspaceMode: "new-wallet",
        selectedWalletUnit: null,
        selectedAction: "mint",
        selectedIntent: "create-wallet",
        selectedTask: null,
        flowStep: "configure"
      };
    case "select-wallet":
      return {
        workspaceMode: "existing-wallet",
        selectedWalletUnit: action.walletUnit,
        selectedAction: null,
        selectedIntent: null,
        selectedTask: null,
        flowStep: "overview"
      };
    case "select-workspace-action":
      const nextAction = action.action ?? mapIntentToDefaultAction(action.intent);
      return {
        workspaceMode: action.intent === "create-wallet" ? "new-wallet" : "existing-wallet",
        selectedWalletUnit: action.intent === "create-wallet" ? null : state.selectedWalletUnit,
        selectedAction: nextAction,
        selectedIntent: action.intent,
        selectedTask:
          action.task === undefined
            ? mapIntentToDefaultTask(action.intent)
            : action.task,
        flowStep: action.flowStep ?? "configure"
      };
    case "set-step":
      return {
        ...state,
        flowStep: action.flowStep
      };
    case "set-task":
      return {
        ...state,
        selectedTask: action.task
      };
    case "clear-selected-action":
      return {
        ...state,
        selectedAction: null,
        selectedIntent: null,
        selectedTask: null,
        flowStep: state.selectedWalletUnit ? "overview" : "overview",
        workspaceMode: state.selectedWalletUnit ? "existing-wallet" : "landing"
      };
    case "clear-selected-wallet":
      return DEFAULT_WORKSPACE_ROUTE_STATE;
  }
}

export function resolveSetupCheckpoint({
  walletReady,
  networkId,
  selectedAction,
  sharedReferenceStatus,
  lockedUtxoCount,
  lockedUtxosLoading
}: SetupCheckpointInput): SetupCheckpoint {
  if (!walletReady) {
    return "wallet";
  }

  if (networkId !== 0) {
    return "network";
  }

  if (!selectedAction) {
    return "ready";
  }

  const prerequisites = new Set<ReadinessKey>(
    USER_ACTION_DEFINITION_MAP[selectedAction]?.prerequisites ?? []
  );

  if (prerequisites.has("stt-reference") && sharedReferenceStatus !== "ready") {
    return "shared-reference";
  }

  if (
    prerequisites.has("locked-utxos") &&
    (lockedUtxosLoading || lockedUtxoCount === 0)
  ) {
    return "funding";
  }

  return "ready";
}
