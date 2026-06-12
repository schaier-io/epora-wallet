// Extracted from permission-wallet-workspace.tsx (21 symbols).
import { type UserActionKind, type UserWorkspaceIntent, type UserWorkspaceTask } from "@/components/user/flow-types";
import { type Asset } from "@/lib/types/contracts";
import { type TransactionInfo } from "@meshsdk/common";
import { type UTxO } from "@meshsdk/core";
import { type LucideIcon } from "lucide-react";

export type ErrorContext = {
  action: string;
  wallet: string | null;
  networkId: number | null;
  context?: Record<string, unknown>;
};

/**
 * Single shared active-state indicator for sidebar items. Reuses the same
 * Framer Motion `layoutId` across every sidebar render path so when the user
 * picks a different item, the teal glow slides between rows instead of
 * cross-fading per-item. Visually keeps the BorderGlow gradient mood, but
 * adds the magic-move motion.
 */

export type ParsedError = {
  message: string;
  details: string;
};

export type WalletBalanceSummary = {
  assets: Asset[];
  loading: boolean;
  error: string | null;
};

export type WalletTransactionSummary = {
  items: TransactionInfo[];
  loading: boolean;
  error: string | null;
};

export type PermissionWalletLockedSummary = {
  address: string;
  lockedAssets: Asset[];
  lockedUtxoCount: number;
  error: string | null;
};

export type OptionalConstrPresetMode = "none" | "empty-alt-0" | "empty-alt-1" | "custom-empty";

export type RequiredConstrPresetMode = "empty-alt-0" | "empty-alt-1" | "custom-empty";

export type OptionalConstrPresetForm = {
  mode: OptionalConstrPresetMode;
  customAlternative: string;
};

export type RequiredConstrPresetForm = {
  mode: RequiredConstrPresetMode;
  customAlternative: string;
};

export type TransferFormState = {
  address: string;
  amount: Asset[];
  inlineDatum: OptionalConstrPresetForm;
};

export type WalletScriptOutputFormState = {
  amount: Asset[];
  inlineDatum: OptionalConstrPresetForm;
};

export type SttSpendActionMode =
  | "use"
  | "renew-proof-of-life"
  | "update-state"
  | "manage-streaming-payments"
  | "use-allowance"
  | "use-beneficiary"
  | "payout-streaming-payment"
  | "consolidate-utxo";

export type GuidedAdminGroupId = "manage-people" | "wallet-settings" | "streamingPayments";

export type GuidedAdminTaskDefinition = {
  id: UserWorkspaceTask;
  group: GuidedAdminGroupId;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  intent: UserWorkspaceIntent;
  action: UserActionKind;
};

export type GuidedAdminGroupDefinition = {
  id: GuidedAdminGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
};

type MintConfirmationPhase =
  | "submitting"
  | "waiting"
  | "refreshing"
  | "confirmed"
  | "delayed";

export type MintConfirmationState = {
  txHash: string;
  phase: MintConfirmationPhase;
  attempts: number;
  maxAttempts: number;
  updatedAt: number;
  createdWalletUnit?: string;
};

export type AssetSelectionOption = {
  unit: string;
  label: string;
  availableLabel: string;
  searchableText: string;
  maxQuantity: string;
};

export type WalletActivityEvent = {
  id: string;
  transaction: TransactionInfo;
  label: string;
  title: string;
  badgeClassName: string;
  summary: string;
  amountSummary: string;
  amountClassName: string;
  actorLabel: string;
  actorDetail: string | null;
  details: Array<{ label: string; value: string }>;
  inputUtxos: UTxO[];
  outputUtxos: UTxO[];
};

export type SetupProgressStep = {
  label: string;
  description: string;
  status: "done" | "active" | "waiting" | "blocked";
};

export type GuidedActionCard = {
  intent: UserWorkspaceIntent;
  action: UserActionKind;
  title: string;
  description: string;
};

