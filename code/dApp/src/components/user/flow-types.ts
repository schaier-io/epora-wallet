import type { LucideIcon } from "lucide-react";
import type {
  ActionKind,
  ConsolidateAuthorityPath,
  OperatorAuthorityPath
} from "@/lib/types/contracts";

export type UserActionKind = ActionKind;
export type UserFlowBranch = "new-wallet" | "existing-token";
export type UserWizardStep = "connect" | "source" | "action" | "configure" | "review";
type UserFlowAudience = "everyday" | "admin" | "expert";
export type UserWorkspaceMode = "landing" | "new-wallet" | "existing-wallet";
export type UserFlowStep = "overview" | "configure" | "review";
export type SetupCheckpoint = "wallet" | "network" | "shared-reference" | "funding" | "ready";
export type UserWorkspaceTask =
  | "people-admins-signers"
  | "people-spending-users"
  | "people-wallet-assignments"
  | "settings-wallet-name"
  | "settings-beneficiaries"
  | "settings-proof-of-life"
  | "settings-multisig-threshold"
  | "streaming-payments-add"
  | "streaming-payments-edit-renew"
  | "streaming-payments-pay-due";

export type UserWorkspaceIntent =
  | "create-wallet"
  | "send"
  | "add-funds"
  | "manage-people"
  | "wallet-settings"
  | "pay-streaming-payments"
  | "manage-streaming-payments"
  | "rewards"
  | "enable-staking"
  | "governance-publish"
  | "governance-vote"
  | "consolidate"
  | "manual-tools";

export type UserWorkspaceRouteState = {
  workspaceMode: UserWorkspaceMode;
  selectedWalletUnit: string | null;
  selectedAction: UserActionKind | null;
  selectedIntent: UserWorkspaceIntent | null;
  selectedTask: UserWorkspaceTask | null;
  flowStep: UserFlowStep;
};

type TaskLane = "recommended" | "advanced";
type TaskRisk = "low" | "medium" | "high";
type TaskGroup =
  | "setup-funding"
  | "everyday-spending"
  | "wallet-operations"
  | "state-management"
  | "special-access"
  | "governance"
  | "manual";

export type ReadinessKey =
  | "wallet"
  | "preprod"
  | "detected-token"
  | "stt-reference"
  | "locking-contract"
  | "locked-utxos";

export type ReadinessIssue = {
  id: string;
  label: string;
  description: string;
  status: "ready" | "warning" | "error";
  blocking: boolean;
  key?: ReadinessKey;
};

export type SetupState = {
  walletName: string | null;
  activeAddress: string | null;
  paymentKeyHash: string | null;
  networkId: number | null;
  walletReady: boolean;
  hasDetectedToken: boolean;
  sharedSttReferenceStatus: "loading" | "missing" | "ready";
  sharedSttReferenceRef: string | null;
  sharedSttReferenceStoreAddress: string | null;
  sharedSttReferenceError: string | null;
  lockingContractAddress: string | null;
  lockingContractError: string | null;
  lockedUtxoCount: number;
  lockedUtxosLoading: boolean;
};

export type TaskDefinition = {
  kind: UserActionKind;
  label: string;
  shortLabel: string;
  description: string;
  outcome: string;
  whenToUse: string;
  whatChanges: string;
  pathLabels: string[];
  surfaceLabel: string;
  startingPoint: string;
  buildLabel: string;
  icon: LucideIcon;
  prerequisites: ReadinessKey[];
  lane: TaskLane;
  group: TaskGroup;
  risk: TaskRisk;
  audience?: UserFlowAudience;
  availabilityReason?: string;
  setupCTA?: string;
  routeExplanation?: string;
};

/** Matches `surfaceLabel` for flows that always use the detected STT + locked inputs in this workspace. */
export const IMPLICIT_LOCKED_INPUT_SURFACE_LABEL = "STT + locked inputs" as const;

export function isImplicitLockedInputSurfaceLabel(surfaceLabel: string): boolean {
  return surfaceLabel === IMPLICIT_LOCKED_INPUT_SURFACE_LABEL;
}

type ActionDraftState = {
  dirty: boolean;
  ready: boolean;
  summary: string;
  blockingHint: string | null;
  nextStep: string;
};

export type ActionDraftMap = Record<UserActionKind, ActionDraftState>;

export type FieldErrors = Record<string, string[]>;

export type TokenCapabilityMap = {
  hasAdminPath: boolean;
  hasDirectAdminSigner: boolean;
  hasMultisigPath: boolean;
  hasDirectUserMatch: boolean;
  hasDirectProofOfLifeRenewalMatch: boolean;
  hasBeneficiaryMatch: boolean;
  hasStreamingPayments: boolean;
  hasLockedUtxos: boolean;
  lockedUtxosLoading: boolean;
  availableOperatorPaths: OperatorAuthorityPath[];
  availableConsolidatePaths: ConsolidateAuthorityPath[];
};

export type AvailableActionDescriptor = {
  kind: UserActionKind;
  pathLabels: string[];
  note: string | null;
};
