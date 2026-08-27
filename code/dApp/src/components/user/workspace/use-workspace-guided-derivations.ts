"use client";
import { guidedOverviewSectionAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { useAtomValue } from "jotai";
import { sttAuthorityPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";

import { deriveWalletHomeFlowAvailability, resolveAutomaticSendPath } from "@/lib/user-flow/guided-helpers";
import { type GuidedActionCard, type GuidedAdminGroupId } from "@/components/user/workspace/types";
import { GUIDED_ADMIN_GROUPS } from "@/components/user/workspace/guided-admin-catalog";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";
import { useMemo } from "react";

import type {
  TokenCapabilityMap,
  UserActionKind,
  UserFlowBranch,
  UserWorkspaceIntent,
  UserWorkspaceTask
} from "@/components/user/flow-types";

import { type useUserFlowState } from "@/components/user/use-user-flow-state";
import { type AllowancePreviewResult } from "@/components/user/workspace/workspace-allowance-preview";

import {
  countAdminUsersInStateForm,
  type StateFormState
} from "@/lib/contracts/state-form";

import {
  type DetectedSttToken
} from "@/lib/mesh/detection";

import { formatCountLabel } from "@/components/user/workspace/helpers";
import {
  recentWalletActivityEventsAtom,
  walletTransactionsAtom
} from "@/components/user/workspace/atoms/workspace-activity.atoms";

export interface WorkspaceGuidedDerivationsInputs {
  actionDrafts: ReturnType<typeof useUserFlowState>["actionDrafts"];
  activeInferredSttStateForm: StateFormState;
  advancedWalletActions: UserActionKind[];
  selectedAction: UserActionKind;
  selectedDetectedToken: DetectedSttToken | null;
  selectedIntent: UserWorkspaceIntent | null;
  selectedTokenCapabilityMap: TokenCapabilityMap | null;
  useAllowancePreview: AllowancePreviewResult;
  userFlowBranch: UserFlowBranch | null;
  wizardSelectedAction: UserActionKind | null;
}

export function useWorkspaceGuidedDerivations(inputs: WorkspaceGuidedDerivationsInputs) {
  const {
    actionDrafts,
    activeInferredSttStateForm,
    advancedWalletActions,
    selectedAction,
    selectedDetectedToken,
    selectedIntent,
    selectedTokenCapabilityMap,
    useAllowancePreview,
    userFlowBranch,
    wizardSelectedAction
  } = inputs;
  const recentWalletActivityEvents = useAtomValue(recentWalletActivityEventsAtom);
  const walletTransactions = useAtomValue(walletTransactionsAtom);
  const guidedOverviewSection = useAtomValue(guidedOverviewSectionAtom);
  const sttAuthorityPath = useAtomValue(sttAuthorityPathAtom);

  const flowAvailability = useMemo(
    () => deriveWalletHomeFlowAvailability(selectedTokenCapabilityMap),
    [selectedTokenCapabilityMap]
  );
  const defaultSendAction = useMemo(
    () => resolveAutomaticSendPath(selectedTokenCapabilityMap),
    [selectedTokenCapabilityMap]
  );
  const guidedEverydayActionCandidates: Array<GuidedActionCard | null> = [
    selectedDetectedToken && flowAvailability.canSend
      ? {
          intent: "send" as const,
          action: defaultSendAction,
          title: "Send funds",
          description:
            defaultSendAction === "use-allowance"
              ? "Use your allowance."
              : defaultSendAction === "use-beneficiary"
                ? "Use recovery-contact access."
                : "Normal wallet send."
        }
      : null,
    selectedDetectedToken
      ? {
          intent: "add-funds" as const,
          action: "lock-funds" as const,
          title: "Receive funds",
          description: "Copy address or add funds."
        }
      : null
  ];
  const guidedEverydayActions = guidedEverydayActionCandidates.filter(
    (entry): entry is GuidedActionCard => entry !== null
  );
  const guidedAdminGroups = GUIDED_ADMIN_GROUPS.filter((group) => {
    if (!selectedDetectedToken) {
      return false;
    }

    if (group.id === "manage-people") {
      return flowAvailability.canManagePeople;
    }

    if (group.id === "wallet-settings") {
      return flowAvailability.canManageSettings;
    }

    return flowAvailability.canManageStreamingPayments || flowAvailability.canPayStreamingPayments;
  });
  const guidedStreamingPaymentTaskBadges: Partial<Record<UserWorkspaceTask, string>> = {
    "streaming-payments-add": "New",
    "streaming-payments-edit-renew": formatCountLabel(
      activeInferredSttStateForm.streamingPayments.length,
      "payment"
    ),
    "streaming-payments-pay-due": flowAvailability.canPayStreamingPayments ? "Pay" : "Locked"
  };
  const guidedAdminGroupBadgeText: Record<GuidedAdminGroupId, string> = {
    "manage-people": formatCountLabel(
      countAdminUsersInStateForm(activeInferredSttStateForm),
      "owner"
    ),
    "wallet-settings": activeInferredSttStateForm.beneficiaries.length > 0
      ? formatCountLabel(activeInferredSttStateForm.beneficiaries.length, "recovery contact", "recovery contacts")
      : "Settings",
    streamingPayments: formatCountLabel(
      activeInferredSttStateForm.streamingPayments.length,
      "payment"
    )
  };
  const guidedAdminGroupStatusText: Record<GuidedAdminGroupId, string> = {
    "manage-people": actionDrafts["update-state"].ready
      ? "Ready"
      : actionDrafts["update-state"].dirty
        ? "Draft"
        : "Needs setup",
    "wallet-settings": actionDrafts["update-state"].ready
      ? "Ready"
      : actionDrafts["update-state"].dirty
        ? "Draft"
        : "Needs setup",
    streamingPayments:
      selectedAction === "payout-streaming-payment"
        ? actionDrafts["payout-streaming-payment"].ready
          ? "Ready"
          : actionDrafts["payout-streaming-payment"].dirty
            ? "Draft"
            : "Needs setup"
        : actionDrafts["manage-streaming-payments"].ready
          ? "Ready"
          : actionDrafts["manage-streaming-payments"].dirty
            ? "Draft"
            : "Needs setup"
  };
  const guidedAdminGroupSummary: Record<GuidedAdminGroupId, string> = {
    "manage-people": "Access and linked wallets.",
    "wallet-settings": "Name, recovery, and approvals.",
    streamingPayments: "Rent, payroll, and repeating transfers."
  };
  const guidedStreamingPaymentsDisabledTasks = flowAvailability.canPayStreamingPayments
    ? []
    : (["streaming-payments-pay-due"] as UserWorkspaceTask[]);
  // Order is the order of operations. `Claim rewards` shipped with no way to reach the step
  // that makes rewards possible, so a user could only ever claim nothing; `Enable staking`
  // and `Cast a vote` were in the capability list, had builders, views and validation, and
  // had no card anywhere.
  const guidedToolActionCandidates: Array<GuidedActionCard | null> = [
    selectedDetectedToken && advancedWalletActions.includes("set-intended-stake-credential")
      ? {
          intent: "enable-staking" as const,
          action: "set-intended-stake-credential" as const,
          title: "Turn on staking",
          description: "Let this wallet's funds earn staking rewards."
        }
      : null,
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "rewards" as const,
          action: "wallet-withdraw" as const,
          title: "Claim rewards",
          description: "Collect staking rewards."
        }
      : null,
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "governance-publish" as const,
          action: "wallet-publish" as const,
          title: "Governance",
          description: "Advanced certificates."
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("wallet-vote")
      ? {
          intent: "governance-vote" as const,
          action: "wallet-vote" as const,
          title: "Cast a vote",
          description: "Vote on a Cardano governance action."
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("consolidate-utxo")
      ? {
          intent: "consolidate" as const,
          action: "consolidate-utxo" as const,
          title: "Tidy funds",
          description: "Merge fund pools."
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("renew-proof-of-life")
      ? {
          intent: "manual-tools" as const,
          action: "renew-proof-of-life" as const,
          title: "Refresh timer",
          description: "Refresh proof of life."
        }
      : null
  ];
  const guidedToolActions = guidedToolActionCandidates.filter(
    (entry): entry is GuidedActionCard => entry !== null
  );
  const selectedActionDefinition = USER_ACTION_DEFINITION_MAP[selectedAction];
  const selectedActionRouteExplanation =
    selectedActionDefinition.routeExplanation ?? selectedActionDefinition.description;
  const selectedActionSetupCta = selectedActionDefinition.setupCTA ?? "Complete setup";
  const sendRouteExplanation =
    selectedIntent !== "send"
      ? null
      : selectedAction === "use-allowance"
        ? useAllowancePreview.target
          ? `Using the daily limit for user ${useAllowancePreview.target.matchedUserId}.`
          : "Will use a daily limit when the connected wallet matches one."
        : selectedAction === "use-beneficiary"
          ? "Spending as a recovery contact."
          : sttAuthorityPath === "multisig"
            ? "Needs co-signers before signing."
            : null;
  const hasActiveComposer = userFlowBranch === "new-wallet" || Boolean(wizardSelectedAction);
  const showGuidedSidebar = userFlowBranch !== "new-wallet";
  const hasGuidedActivityContext =
    walletTransactions.loading ||
    Boolean(walletTransactions.error) ||
    recentWalletActivityEvents.length > 0;
  const resolvedGuidedOverviewSection =
    guidedOverviewSection === "transactions" && !hasGuidedActivityContext
      ? "home"
      : guidedOverviewSection;
  const activeAdminGroupId: GuidedAdminGroupId | null =
    selectedIntent === "manage-people"
      ? "manage-people"
      : selectedIntent === "wallet-settings"
        ? "wallet-settings"
        : selectedIntent === "manage-streaming-payments" || selectedIntent === "pay-streaming-payments"
          ? "streamingPayments"
          : null;
  const isGuidedHomeSelected = !wizardSelectedAction && resolvedGuidedOverviewSection === "home";
  const isGuidedTransactionsSelected =
    !wizardSelectedAction && resolvedGuidedOverviewSection === "transactions";

  return {
    flowAvailability,
    defaultSendAction,
    guidedEverydayActionCandidates,
    guidedEverydayActions,
    guidedAdminGroups,
    guidedStreamingPaymentTaskBadges,
    guidedAdminGroupBadgeText,
    guidedAdminGroupStatusText,
    guidedAdminGroupSummary,
    guidedStreamingPaymentsDisabledTasks,
    guidedToolActionCandidates,
    guidedToolActions,
    selectedActionDefinition,
    selectedActionRouteExplanation,
    selectedActionSetupCta,
    sendRouteExplanation,
    hasActiveComposer,
    showGuidedSidebar,
    hasGuidedActivityContext,
    resolvedGuidedOverviewSection,
    activeAdminGroupId,
    isGuidedHomeSelected,
    isGuidedTransactionsSelected
  };
}
