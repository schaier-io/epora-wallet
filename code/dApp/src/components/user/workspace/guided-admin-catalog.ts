// Static catalog of the guided admin surface: task groups, the tasks inside
// them, and the per-task intent/action wiring. Pure data — icon fields hold
// component references, never JSX.
import {
  type GuidedAdminGroupDefinition,
  type GuidedAdminTaskDefinition
} from "@/components/user/workspace/types";
import { type UserWorkspaceTask } from "@/components/user/flow-types";
import {
  CalendarArrowDown,
  CalendarPlus2,
  CalendarSearch,
  Clock3,
  HandHeart,
  KeyRound,
  PencilLine,
  Repeat,
  Settings2,
  ShieldUser,
  UserCog,
  UsersRound,
  Waypoints
} from "lucide-react";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceGuidedAdminCatalog.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceGuidedAdminCatalog", defaultMessages);

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

export const GUIDED_ADMIN_TASK_MAP = Object.fromEntries(
  GUIDED_ADMIN_TASKS.map((task) => [task.id, task])
) as Record<UserWorkspaceTask, GuidedAdminTaskDefinition>;
