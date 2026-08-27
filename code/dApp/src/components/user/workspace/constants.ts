// Extracted from permission-wallet-workspace.tsx (27 symbols).
import { type GuidedAdminGroupDefinition, type GuidedAdminTaskDefinition, type OptionalConstrPresetForm, type RequiredConstrPresetForm } from "@/components/user/workspace/types";
import { type UserWorkspaceTask } from "@/components/user/flow-types";
import { buildStateActionData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { type Asset, DEFAULT_MINT_STT_LOVELACE } from "@/lib/types/contracts";
import { CalendarArrowDown, CalendarPlus2, CalendarSearch, Clock3, HandHeart, KeyRound, PencilLine, Repeat, Settings2, ShieldUser, UserCog, UsersRound, Waypoints } from "lucide-react";
import { z } from "zod";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceConstants.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceConstants", defaultMessages);

export const LONG_DESCRIPTION_LIMIT = 78;

export const GUIDED_ADMIN_GROUPS: GuidedAdminGroupDefinition[] = [
  {
    id: "manage-people",
    label: i18n("people"),
    description: i18n("ownersSpendersAndTheirSignerKeys"),
    icon: UsersRound
  },
  {
    id: "wallet-settings",
    label: i18n("walletSettings"),
    description: i18n("nameRecoveryPlanTimerAndApprovals"),
    icon: Settings2
  },
  {
    id: "streamingPayments",
    label: i18n("scheduledPayments"),
    description: i18n("createChangeOrPaySchedules"),
    icon: Repeat
  }
];

export const GUIDED_ADMIN_TASKS: GuidedAdminTaskDefinition[] = [
  {
    id: "people-admins-signers",
    group: "manage-people",
    label: i18n("ownersApprovals"),
    shortLabel: i18n("owners"),
    description: i18n("chooseWhoManagesTheWalletAndHowMuch"),
    icon: ShieldUser,
    intent: "manage-people",
    action: "update-state"
  },
  {
    id: "people-spending-users",
    group: "manage-people",
    label: i18n("spenders"),
    shortLabel: i18n("spenders"),
    description: i18n("setDailyLimitsAndResetDates"),
    icon: UserCog,
    intent: "manage-people",
    action: "update-state"
  },
  {
    id: "people-wallet-assignments",
    group: "manage-people",
    label: i18n("signerKeys"),
    shortLabel: i18n("signers"),
    description: i18n("linkSignerKeysToEachPerson"),
    icon: KeyRound,
    intent: "manage-people",
    action: "update-state"
  },
  {
    id: "settings-wallet-name",
    group: "wallet-settings",
    label: i18n("walletName"),
    shortLabel: i18n("name"),
    description: i18n("chooseANameYouWillRecognizeLater"),
    icon: PencilLine,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-beneficiaries",
    group: "wallet-settings",
    label: i18n("recoveryContacts"),
    shortLabel: i18n("recoveryContacts"),
    description: i18n("setWhoMayWithdrawAOneTimeShare"),
    icon: HandHeart,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-proof-of-life",
    group: "wallet-settings",
    label: i18n("wakeUpTimer"),
    shortLabel: i18n("timer"),
    description: i18n("whenRecoveryContactsCanWithdrawTheirShare"),
    icon: Clock3,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-multisig-threshold",
    group: "wallet-settings",
    label: i18n("approvals"),
    shortLabel: i18n("approvals"),
    description: i18n("numberOfApprovalsNeededForSensitiveActions"),
    icon: Waypoints,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "streaming-payments-add",
    group: "streamingPayments",
    label: i18n("addScheduledPayment"),
    shortLabel: i18n("add"),
    description: i18n("setARecipientRateAndDateRange"),
    icon: CalendarPlus2,
    intent: "manage-streaming-payments",
    action: "manage-streaming-payments"
  },
  {
    id: "streaming-payments-edit-renew",
    group: "streamingPayments",
    label: i18n("changeASchedule"),
    shortLabel: i18n("edit"),
    description: i18n("editAnEndDateOrStopFutureAccrual"),
    icon: CalendarSearch,
    intent: "manage-streaming-payments",
    action: "manage-streaming-payments"
  },
  {
    id: "streaming-payments-pay-due",
    group: "streamingPayments",
    label: i18n("payAccruedAmounts"),
    shortLabel: i18n("pay"),
    description: i18n("releaseAmountsThatHaveAccruedAndRemainUnpaid"),
    icon: CalendarArrowDown,
    intent: "pay-streaming-payments",
    action: "payout-streaming-payment"
  }
];

// Start with an empty ADA row (not a pre-filled 5 ₳) so the deposit amount is a
// deliberate choice — consistent with the Send flow, which also starts blank.
export const DEFAULT_LOCK_ASSETS: Asset[] = [{ unit: "lovelace", quantity: "" }];

// Max wallet UTxOs swept into one enterprise→base migration / orphan-cleanup
// transaction. Each is a script input (execution-unit heavy), so a sweep of many
// UTxOs is batched: consolidate this many per tx, then re-check finds the rest.
// Conservative so the tx stays well under the protocol execution-unit ceiling.
export const MAX_ORPHAN_SWEEP_INPUTS = 15;

export const DEFAULT_MINT_STARTER_ASSETS: Asset[] = [
  { unit: "lovelace", quantity: DEFAULT_MINT_STT_LOVELACE }
];

export const DEFAULT_OPTIONAL_CONSTR_PRESET: OptionalConstrPresetForm = {
  mode: "none",
  customAlternative: "0"
};

export const DEFAULT_REQUIRED_CONSTR_PRESET: RequiredConstrPresetForm = {
  mode: "empty-alt-0",
  customAlternative: "0"
};

export const WALLET_ACTIVITY_PAGE_SIZE = 5;

export const RECENT_WALLET_TRANSACTION_FETCH_PAGES = 8;

export const RECENT_WALLET_TRANSACTION_VISIBLE_LIMIT = 30;

export const RECENT_WALLET_ACTIVITY_ANCHOR_LIMIT = 12;

export const RECENT_STT_TRANSACTION_FETCH_PAGES = 10;

export const MINT_CONFIRMATION_MAX_ATTEMPTS = 12;

export const MINT_CONFIRMATION_INITIAL_DELAY_MS = 600;

export const MINT_CONFIRMATION_POLL_MS = 3500;

export const GUIDED_ADMIN_TASK_MAP = Object.fromEntries(
  GUIDED_ADMIN_TASKS.map((task) => [task.id, task])
) as Record<UserWorkspaceTask, GuidedAdminTaskDefinition>;

export const NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d+$/, i18n("enterAWholeNumber"));

export const OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^\d+$/.test(value), i18n("enterAWholeNumber"));

export const REQUIRED_TEXT_SCHEMA = z.string().trim().min(1, i18n("thisFieldIsRequired"));

export const MINT_PERFORMED_ACTION = buildStateActionData("mint");

export const RENEW_PROOF_OF_LIFE_ACTION = buildStateActionData(
  resolveStructuredOnChainAction("renew-proof-of-life")
);

export const ALLOWANCE_WITHDRAWAL_ACTION = buildStateActionData({
  kind: "allowance-withdrawal"
});

export const BENEFICIARY_WITHDRAWAL_ACTION = buildStateActionData({
  kind: "beneficiary-withdrawal"
});

export const STREAMING_PAYMENT_PAYOUT_ACTION = buildStateActionData({
  kind: "streaming-payment-payout"
});

export const RECENT_RECIPIENTS_STORAGE_KEY = "permission-wallet:recent-recipients";

export const DEFAULT_SAFETY_TIMER_MS = 30 * 24 * 60 * 60 * 1000;
