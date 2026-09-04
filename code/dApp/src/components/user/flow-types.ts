import type { LucideIcon } from "lucide-react";
import type {
  ActionKind,
  ConsolidateAuthorityPath,
  OperatorAuthorityPath
} from "@/lib/types/contracts";

export type UserActionKind = Exclude<ActionKind, "wallet-spend">;
export type UserFlowBranch = "new-wallet" | "existing-token";
export type UserWizardStep = "connect" | "source" | "action" | "configure" | "review";
export type UserWorkspaceMode = "landing" | "new-wallet" | "existing-wallet";
export type UserFlowStep = "overview" | "configure" | "review";
export type UserOverviewSection = "home" | "transactions";
export type SetupCheckpoint = "wallet" | "network" | "shared-reference" | "funding" | "ready";
export type UserWorkspaceTask =
  | "settings-people"
  | "settings-wallet-name"
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
  /**
   * Which half of the wallet overview is showing, and which asset row is expanded inside
   * it. Both used to be component state, so Activity and an open asset had no URL of their
   * own: Back skipped straight out of `/user` and re-fired the risk gate.
   */
  overviewSection: UserOverviewSection;
  assetDetailUnit: string | null;
};

type TaskRisk = "low" | "medium" | "high";

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
  /** What is wrong, as a statement of fact. Never the instruction for fixing it. */
  description: string;
  /**
   * The exact next recovery step, or absent when there is nothing the reader can do
   * (a transient check still running). The review rail shows it under the description
   * so a blocked action always answers "why" and "what now" together.
   */
  recovery?: string;
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
  icon: LucideIcon;
  prerequisites: ReadinessKey[];
  risk: TaskRisk;
  /**
   * First line of the review receipt for actions with no receipt branch of their own.
   * Without it the receipt lower-cased the label and dropped the article, producing
   * "You are preparing claim staking rewards." Written as a whole sentence stating what
   * the action does to the wallet.
   */
  receiptSummary?: string;
  setupCTA?: string;
  routeExplanation?: string;
};

/** Matches `surfaceLabel` for flows that always use the detected STT + locked inputs in this workspace. */
export const IMPLICIT_LOCKED_INPUT_SURFACE_LABEL = "STT + fund pools" as const;

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
