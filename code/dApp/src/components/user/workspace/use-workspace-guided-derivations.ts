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
  selectableWizardActionKinds: Set<UserActionKind>;
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
    selectableWizardActionKinds,
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
    // Gated on the SAME set the clamp guard validates against
    // (`use-workspace-wizard-effects.ts` clears a selected action that is not in
    // selectableWizardActionKinds). Capability availability and the guard used to
    // come from different derivations, so a card could render and then bounce the
    // click straight back to Home the moment the two diverged — e.g. while the
    // connected key hash blips mid-reconnect, a spender's "Send funds" card stayed
    // visible but its use-allowance action was no longer clamp-valid.
    selectedDetectedToken && selectableWizardActionKinds.has(defaultSendAction)
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
      : null,
    // Sits above the staking tools: scheduling a payment is an everyday act on a
    // shared wallet, not a management setting. The old MANAGE group card expanded
    // into three tasks the streaming surface's own tabs already offer.
    selectedDetectedToken &&
    (flowAvailability.canManageStreamingPayments || flowAvailability.canPayStreamingPayments)
      ? {
          // `manage-streaming-payments` is only clamp-valid for a key that holds an
          // operator path, which is exactly `canManageStreamingPayments`. A payee who
          // can only collect a due payment reached this card through
          // `canPayStreamingPayments`, so routing them at the management action sent
          // them to a flow the clamp guard bounced straight back to Home.
          intent: flowAvailability.canManageStreamingPayments
            ? ("manage-streaming-payments" as const)
            : ("pay-streaming-payments" as const),
          action: flowAvailability.canManageStreamingPayments
            ? ("manage-streaming-payments" as const)
            : ("payout-streaming-payment" as const),
          title: i18n("scheduledPayments"),
          description: i18n("addChangeOrPayAScheduledPayment")
        }
      : null
  ];
  const guidedEverydayActions = guidedEverydayActionCandidates.filter(
    (entry): entry is GuidedActionCard => entry !== null
  );
  // People and Scheduled payments merged into other groups; Wallet settings is
  // the only MANAGE card left.
  const guidedAdminGroups = GUIDED_ADMIN_GROUPS.filter(
    () => selectedDetectedToken !== null && flowAvailability.canManageSettings
  );
  const guidedStreamingPaymentTaskBadges: Partial<Record<UserWorkspaceTask, string>> = {
    "streaming-payments-add": i18n("new"),
    "streaming-payments-edit-renew": formatCountLabel(
      activeInferredSttStateForm.streamingPayments.length,
      "payment"
    ),
    "streaming-payments-pay-due": flowAvailability.canPayStreamingPayments
      ? i18n("pay")
      : i18n("locked")
  };
  const guidedAdminGroupBadgeText: Record<GuidedAdminGroupId, string> = {
    "wallet-settings": activeInferredSttStateForm.beneficiaries.length > 0
      ? formatCountLabel(activeInferredSttStateForm.beneficiaries.length, "recoveryContact")
      : i18n("settings"),
    streamingPayments: formatCountLabel(
      activeInferredSttStateForm.streamingPayments.length,
      "payment"
    )
  };
  const guidedAdminGroupStatusText: Record<GuidedAdminGroupId, string> = {
    "wallet-settings": actionDrafts["update-state"].ready
      ? i18n("configured")
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
  // Both halves of the surface are gated, because the reader can hold either
  // capability without the other. A payee reaches this surface through
  // `canPayStreamingPayments` and holds no operator path, so Add and Edit map to
  // `manage-streaming-payments`, which is not clamp-valid for them: clicking one
  // cleared the selection and sent them to Home.
  const guidedStreamingPaymentsDisabledTasks = [
    ...(flowAvailability.canPayStreamingPayments ? [] : ["streaming-payments-pay-due"]),
    ...(flowAvailability.canManageStreamingPayments
      ? []
      : ["streaming-payments-add", "streaming-payments-edit-renew"])
  ] as UserWorkspaceTask[];
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
    selectedDetectedToken && advancedWalletActions.includes("consolidate-utxo")
      ? {
          intent: "consolidate" as const,
          action: "consolidate-utxo" as const,
          title: i18n("tidyFunds"),
          description: i18n("mergeFundPools")
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
    selectedIntent === "manage-people" || selectedIntent === "wallet-settings"
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
