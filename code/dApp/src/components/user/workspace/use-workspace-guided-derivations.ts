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
  const countI18n = useTranslations("Counts");
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
              ? i18n("payFromThisSpenderSDailyAllowance")
              : defaultSendAction === "use-beneficiary"
                ? i18n("withdrawTheContactSOneTimeRecoveryShare")
                : i18n("payFromTheSharedBalance")
        }
      : null,
    selectedDetectedToken
      ? {
          intent: "add-funds" as const,
          action: "lock-funds" as const,
          title: i18n("receiveFunds"),
          description: i18n("copyTheReceiveAddressOrAddFundsFrom")
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
    "streaming-payments-edit-renew": countI18n("rule", {
      count: activeInferredSttStateForm.streamingPayments.length
    }),
    "streaming-payments-pay-due": flowAvailability.canPayStreamingPayments ? i18n("pay") : i18n("locked")
  };
  const guidedAdminGroupBadgeText: Record<GuidedAdminGroupId, string> = {
    "manage-people": countI18n("owner", {
      count: countAdminUsersInStateForm(activeInferredSttStateForm)
    }),
    "wallet-settings": activeInferredSttStateForm.beneficiaries.length > 0
      ? countI18n("recoveryContact", { count: activeInferredSttStateForm.beneficiaries.length })
      : i18n("settings"),
    streamingPayments: countI18n("rule", { count: activeInferredSttStateForm.streamingPayments.length })
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
  const guidedAdminGroupSummary: Record<GuidedAdminGroupId, string> = {
    "manage-people": i18n("ownersSpendersAndSignerKeys"),
    "wallet-settings": i18n("settingsSummary"),
    streamingPayments: i18n("createStopOrPaySchedules")
  };
  const guidedStreamingPaymentsDisabledTasks = flowAvailability.canPayStreamingPayments
    ? []
    : (["streaming-payments-pay-due"] as UserWorkspaceTask[]);
  const guidedToolActionCandidates: Array<GuidedActionCard | null> = [
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "rewards" as const,
          action: "wallet-withdraw" as const,
          title: i18n("claimRewards"),
          description: i18n("moveEarnedAdaIntoTheWallet")
        }
      : null,
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "governance-publish" as const,
          action: "wallet-publish" as const,
          title: i18n("governance"),
          description: i18n("publishACertificateOrCastAVote")
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("consolidate-utxo")
      ? {
          intent: "consolidate" as const,
          action: "consolidate-utxo" as const,
          title: i18n("tidyFunds"),
          description: i18n("combineSmallFundPools")
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("renew-proof-of-life")
      ? {
          intent: "manual-tools" as const,
          action: "renew-proof-of-life" as const,
          title: i18n("refreshTimer"),
          description: i18n("pushTheRecoveryDateForward")
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
          ? i18n("usingDailyLimitForSpender", { spenderId: useAllowancePreview.target.matchedUserId })
          : i18n("usesDailyLimitForMatchingSigner")
        : selectedAction === "use-beneficiary"
          ? i18n("oneTimeWithdrawalRemovesContact")
          : sttAuthorityPath === "multisig"
            ? i18n("needsRequiredApprovalGroup")
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
