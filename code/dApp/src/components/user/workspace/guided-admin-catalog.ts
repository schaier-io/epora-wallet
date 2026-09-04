// Static catalog of the guided admin surface: task groups, the tasks inside
// them, and the per-task intent/action wiring. Pure data: icon fields hold
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
  PencilLine,
  Repeat,
  Settings2,
  UsersRound,
  Waypoints
} from "lucide-react";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceGuidedAdminCatalog.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceGuidedAdminCatalog", defaultMessages);

export const GUIDED_ADMIN_GROUPS: GuidedAdminGroupDefinition[] = [
  {
    id: "wallet-settings",
    label: i18n("walletSettings"),
    description: i18n("nameRecoveryTimerApprovals"),
    icon: Settings2
  },
  {
    id: "streamingPayments",
    label: i18n("scheduledPayments"),
    description: i18n("addChangeOrPayAScheduledPayment"),
    icon: Repeat
  }
];

export const GUIDED_ADMIN_TASKS: GuidedAdminTaskDefinition[] = [
  {
    // The People page merged into Wallet settings as its first tab: the same
    // update-state form was reachable through two sidebar entries, and the
    // readers' two questions - "who can act" and "how the wallet behaves" -
    // belong to one surface. Legacy `manage-people` deep links resolve here.
    id: "settings-people",
    group: "wallet-settings",
    label: i18n("people"),
    shortLabel: "People",
    description: i18n("ownersSpendersAndLinkedWallets"),
    icon: UsersRound,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-wallet-name",
    group: "wallet-settings",
    label: i18n("walletName"),
    shortLabel: "Name",
    description: i18n("shownInThisApp"),
    icon: PencilLine,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-beneficiaries",
    group: "wallet-settings",
    label: i18n("recoveryContacts"),
    shortLabel: "Recovery contacts",
    description: i18n("unlocksAndLimits"),
    icon: HandHeart,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-proof-of-life",
    group: "wallet-settings",
    label: i18n("proofOfLife"),
    shortLabel: "Timer",
    description: i18n("whenRecoveryContactsCanStepIn"),
    icon: Clock3,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-multisig-threshold",
    group: "wallet-settings",
    // Not "Co-signing": the top nav uses that word for the /user/proposals
    // queue, and both are on screen at once. This one is the setting -- the
    // people and their count -- not the queue.
    label: i18n("coSignerThreshold"),
    shortLabel: "Co-signers",
    description: i18n("howManyCoSignersMustApproveASensitive"),
    icon: Waypoints,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "streaming-payments-add",
    group: "streamingPayments",
    label: i18n("addScheduledPayment"),
    shortLabel: "Add",
    description: i18n("createAScheduledPayment"),
    icon: CalendarPlus2,
    intent: "manage-streaming-payments",
    action: "manage-streaming-payments"
  },
  {
    id: "streaming-payments-edit-renew",
    group: "streamingPayments",
    label: i18n("editOrRenew"),
    shortLabel: "Edit",
    description: i18n("updateScheduledPayments"),
    icon: CalendarSearch,
    intent: "manage-streaming-payments",
    action: "manage-streaming-payments"
  },
  {
    id: "streaming-payments-pay-due",
    group: "streamingPayments",
    label: i18n("payDue"),
    shortLabel: "Pay",
    description: i18n("payWhatAScheduledPaymentOwes"),
    icon: CalendarArrowDown,
    intent: "pay-streaming-payments",
    action: "payout-streaming-payment"
  }
];

export const GUIDED_ADMIN_TASK_MAP = Object.fromEntries(
  GUIDED_ADMIN_TASKS.map((task) => [task.id, task])
) as Record<UserWorkspaceTask, GuidedAdminTaskDefinition>;
