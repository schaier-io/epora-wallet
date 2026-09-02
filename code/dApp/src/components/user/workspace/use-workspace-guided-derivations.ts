"use client";
import { useTranslations } from "next-intl";

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
  const i18n = useTranslations("ComponentsUserWorkspaceUseWorkspaceGuidedDerivations");
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
          title: i18n("sendFunds"),
          description:
            defaultSendAction === "use-allowance"
              ? i18n("useYourAllowance")
              : defaultSendAction === "use-beneficiary"
                ? i18n("useRecoveryContactAccess")
                : i18n("normalWalletSend")
        }
      : null,
    selectedDetectedToken
      ? {
          intent: "add-funds" as const,
          action: "lock-funds" as const,
          title: i18n("receiveFunds"),
          description: i18n("copyAddressOrAddFunds")
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
    "streaming-payments-add": i18n("new"),
    "streaming-payments-edit-renew": formatCountLabel(
      activeInferredSttStateForm.streamingPayments.length,
      i18n("payment")
    ),
    "streaming-payments-pay-due": flowAvailability.canPayStreamingPayments
      ? i18n("pay")
      : i18n("locked")
  };
  const guidedAdminGroupBadgeText: Record<GuidedAdminGroupId, string> = {
    "manage-people": formatCountLabel(
      countAdminUsersInStateForm(activeInferredSttStateForm),
      i18n("owner")
    ),
    "wallet-settings": activeInferredSttStateForm.beneficiaries.length > 0
      ? formatCountLabel(activeInferredSttStateForm.beneficiaries.length, i18n("recoveryContact"), i18n("recoveryContacts"))
      : i18n("settings"),
    streamingPayments: formatCountLabel(
      activeInferredSttStateForm.streamingPayments.length,
      i18n("payment")
    )
  };
  const guidedAdminGroupStatusText: Record<GuidedAdminGroupId, string> = {
    "manage-people": actionDrafts["update-state"].ready
      ? i18n("ready")
      : actionDrafts["update-state"].dirty
        ? i18n("draft")
        : i18n("needsSetup"),
    "wallet-settings": actionDrafts["update-state"].ready
      ? i18n("ready")
      : actionDrafts["update-state"].dirty
        ? i18n("draft")
        : i18n("needsSetup"),
    streamingPayments:
      selectedAction === "payout-streaming-payment"
        ? actionDrafts["payout-streaming-payment"].ready
          ? i18n("ready")
          : actionDrafts["payout-streaming-payment"].dirty
            ? i18n("draft")
            : i18n("needsSetup")
        : actionDrafts["manage-streaming-payments"].ready
          ? i18n("ready")
          : actionDrafts["manage-streaming-payments"].dirty
            ? i18n("draft")
            : i18n("needsSetup")
  };
  // `guidedAdminGroupSummary` used to be derived here and rendered under the active
  // card's description; the pairs were near-duplicates, so the summary line and its
  // plumbing were dropped from the sidebar entirely.
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
          title: i18n("turnOnStaking"),
          description: i18n("letThisWalletSFundsEarnStakingRewards")
        }
      : null,
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "rewards" as const,
          action: "wallet-withdraw" as const,
          title: i18n("claimRewards"),
          description: i18n("collectStakingRewards")
        }
      : null,
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "governance-publish" as const,
          action: "wallet-publish" as const,
          title: i18n("governance"),
          description: i18n("advancedCertificates")
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("wallet-vote")
      ? {
          intent: "governance-vote" as const,
          action: "wallet-vote" as const,
          title: i18n("castAVote"),
          description: i18n("voteOnACardanoGovernanceAction")
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("consolidate-utxo")
      ? {
          intent: "consolidate" as const,
          action: "consolidate-utxo" as const,
          title: i18n("tidyFunds"),
          description: i18n("mergeFundPools")
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("renew-proof-of-life")
      ? {
          intent: "manual-tools" as const,
          action: "renew-proof-of-life" as const,
          title: i18n("refreshTimer"),
          description: i18n("refreshProofOfLife")
        }
      : null
  ];
  const guidedToolActions = guidedToolActionCandidates.filter(
    (entry): entry is GuidedActionCard => entry !== null
  );
  const selectedActionDefinition = USER_ACTION_DEFINITION_MAP[selectedAction];
  const selectedActionRouteExplanation =
    selectedActionDefinition.routeExplanation ?? selectedActionDefinition.description;
  const selectedActionSetupCta = selectedActionDefinition.setupCTA ?? i18n("completeSetup");
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
