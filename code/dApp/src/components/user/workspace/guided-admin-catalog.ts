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

export const GUIDED_ADMIN_GROUPS: GuidedAdminGroupDefinition[] = [
  {
    id: "manage-people",
    label: "People",
    description: "Owners, users, and linked wallets.",
    icon: UsersRound
  },
  {
    id: "wallet-settings",
    label: "Wallet settings",
    description: "Name, recovery, timer, approvals.",
    icon: Settings2
  },
  {
    id: "streamingPayments",
    label: "Scheduled payments",
    description: "Add, change, or pay a scheduled payment.",
    icon: Repeat
  }
];

export const GUIDED_ADMIN_TASKS: GuidedAdminTaskDefinition[] = [
  {
    id: "people-admins-signers",
    group: "manage-people",
    label: "Owners & approvers",
    shortLabel: "Owners",
    description: "Who controls this wallet.",
    icon: ShieldUser,
    intent: "manage-people",
    action: "update-state"
  },
  {
    id: "people-spending-users",
    group: "manage-people",
    label: "Spending users",
    shortLabel: "Users",
    description: "Daily spend limits and resets.",
    icon: UserCog,
    intent: "manage-people",
    action: "update-state"
  },
  {
    id: "people-wallet-assignments",
    group: "manage-people",
    label: "Wallet assignments",
    shortLabel: "Wallets",
    description: "Linked wallets only.",
    icon: KeyRound,
    intent: "manage-people",
    action: "update-state"
  },
  {
    id: "settings-wallet-name",
    group: "wallet-settings",
    label: "Wallet name",
    shortLabel: "Name",
    description: "Shown in this app.",
    icon: PencilLine,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-beneficiaries",
    group: "wallet-settings",
    label: "Recovery contacts",
    shortLabel: "Recovery contacts",
    description: "Unlocks and limits.",
    icon: HandHeart,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-proof-of-life",
    group: "wallet-settings",
    label: "Wake-up timer",
    shortLabel: "Timer",
    description: "When recovery contacts can step in.",
    icon: Clock3,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "settings-multisig-threshold",
    group: "wallet-settings",
    label: "Approvals",
    shortLabel: "Approvals",
    description: "Number of approvals needed for sensitive actions.",
    icon: Waypoints,
    intent: "wallet-settings",
    action: "update-state"
  },
  {
    id: "streaming-payments-add",
    group: "streamingPayments",
    label: "Add scheduled payment",
    shortLabel: "Add",
    description: "Create a scheduled payment.",
    icon: CalendarPlus2,
    intent: "manage-streaming-payments",
    action: "manage-streaming-payments"
  },
  {
    id: "streaming-payments-edit-renew",
    group: "streamingPayments",
    label: "Edit or renew",
    shortLabel: "Edit",
    description: "Update scheduled payments.",
    icon: CalendarSearch,
    intent: "manage-streaming-payments",
    action: "manage-streaming-payments"
  },
  {
    id: "streaming-payments-pay-due",
    group: "streamingPayments",
    label: "Pay due",
    shortLabel: "Pay",
    description: "Pay what a scheduled payment owes.",
    icon: CalendarArrowDown,
    intent: "pay-streaming-payments",
    action: "payout-streaming-payment"
  }
];

export const GUIDED_ADMIN_TASK_MAP = Object.fromEntries(
  GUIDED_ADMIN_TASKS.map((task) => [task.id, task])
) as Record<UserWorkspaceTask, GuidedAdminTaskDefinition>;
