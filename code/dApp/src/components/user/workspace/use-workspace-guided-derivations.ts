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

export type GuidedAdminGroupStatusToken = "ready" | "draft" | "needsSetup";

export interface GuidedAdminGroupStatus {
  token: GuidedAdminGroupStatusToken;
  label: string;
}

type GuidedDerivationsTranslator = ReturnType<
  typeof useTranslations<"ComponentsUserWorkspaceUseWorkspaceGuidedDerivations">
>;

/**
 * The one badge map for the scheduled-payment tabs. The sidebar derived it here while
 * `editors/streaming-editors.tsx` built a second map of its own, so the Add chip read
 * "New" on one tab and "Create" on the others and the chip row reflowed on every tab
 * switch. Both surfaces now call this.
 */
export function buildStreamingPaymentTaskBadges(
  translate: GuidedDerivationsTranslator,
  paymentCount: number,
  canPayDue: boolean
): Partial<Record<UserWorkspaceTask, string>> {
  return {
    "streaming-payments-add": translate("new"),
    "streaming-payments-edit-renew": formatCountLabel(paymentCount, "payment"),
    "streaming-payments-pay-due": canPayDue ? translate("pay") : translate("locked")
  };
}

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
          title: i18n("sendFunds")
        }
      : null,
    selectedDetectedToken
      ? {
          intent: "add-funds" as const,
          action: "lock-funds" as const,
          // "Add funds", the name its destination already carries: the screen is
          // `?action=lock-funds`, its heading is "Add funds" and its tab title is
          // "Add funds · Epora Wallet". `workspace-transactions-view.test.tsx` settled
          // this rule for the asset drill-down button and named this card as the last
          // place still saying "Receive funds". It also covers more of the screen than
          // "Receive" does: the page shows the receive address AND moves funds in from
          // the connected wallet.
          title: i18n("addFunds"),
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
          // Without this the card landed on the Edit tab, which on a wallet with no
          // payments yet is a dead end: "Nothing to change. Add a payment on the other
          // tab first." The Home dashboard tile already picks Add in that case; this
          // makes the sidebar entry agree with it.
          //
          // "Has schedules" is read off the same capability map as the rest of this card
          // (`canPayStreamingPayments` is `hasStreamingPayments`, `guided-helpers.ts`),
          // not off `activeInferredSttStateForm`. That form loads separately, and while
          // it was still empty the card sent a wallet that does have payments to Add.
          task: flowAvailability.canManageStreamingPayments
            ? flowAvailability.canPayStreamingPayments
              ? ("streaming-payments-edit-renew" as const)
              : ("streaming-payments-add" as const)
            : ("streaming-payments-pay-due" as const),
          title: i18n("scheduledPayments"),
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
  const guidedStreamingPaymentTaskBadges = buildStreamingPaymentTaskBadges(
    i18n,
    activeInferredSttStateForm.streamingPayments.length,
    flowAvailability.canPayStreamingPayments
  );
  const guidedAdminGroupBadgeText: Record<GuidedAdminGroupId, string> = {
    "wallet-settings": activeInferredSttStateForm.beneficiaries.length > 0
      ? formatCountLabel(activeInferredSttStateForm.beneficiaries.length, "recoveryContact")
      : i18n("settings"),
    streamingPayments: formatCountLabel(
      activeInferredSttStateForm.streamingPayments.length,
      "payment"
    )
  };
  const resolveDraftStatusToken = (kind: UserActionKind): GuidedAdminGroupStatusToken =>
    actionDrafts[kind].ready ? "ready" : actionDrafts[kind].dirty ? "draft" : "needsSetup";
  const walletSettingsStatusToken = resolveDraftStatusToken("update-state");
  const streamingPaymentsStatusToken = resolveDraftStatusToken(
    selectedAction === "payout-streaming-payment"
      ? "payout-streaming-payment"
      : "manage-streaming-payments"
  );
  // Carries the token next to the label. The sidebar badge used to pick its tone by
  // comparing this value against the English literals "Configured" and "Draft", which
  // left every non-English locale on the fallback tone and never matched the
  // `streamingPayments` label "Ready" at all. The name keeps the `...Text` suffix only
  // because renaming it reaches into `use-permission-wallet-workspace-state.tsx`.
  const guidedAdminGroupStatusText: Record<GuidedAdminGroupId, GuidedAdminGroupStatus> = {
    "wallet-settings": {
      token: walletSettingsStatusToken,
      label:
        walletSettingsStatusToken === "ready"
          ? i18n("configured")
          : walletSettingsStatusToken === "draft"
            ? i18n("draft")
            : i18n("needsSetup")
    },
    streamingPayments: {
      token: streamingPaymentsStatusToken,
      label:
        streamingPaymentsStatusToken === "ready"
          ? i18n("ready")
          : streamingPaymentsStatusToken === "draft"
            ? i18n("draft")
            : i18n("needsSetup")
    }
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
          title: i18n("enableStaking"),
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("consolidate-utxo")
      ? {
          intent: "consolidate" as const,
          action: "consolidate-utxo" as const,
          title: i18n("tidyFunds"),
        }
      : null,
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "rewards" as const,
          action: "wallet-withdraw" as const,
          title: i18n("claimRewards"),
        }
      : null,
    selectedDetectedToken && selectedTokenCapabilityMap?.availableOperatorPaths.length
      ? {
          intent: "governance-publish" as const,
          action: "wallet-publish" as const,
          title: i18n("publishCertificate"),
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("wallet-vote")
      ? {
          intent: "governance-vote" as const,
          action: "wallet-vote" as const,
          title: i18n("castAVote"),
        }
      : null,
    selectedDetectedToken && advancedWalletActions.includes("renew-proof-of-life")
      ? {
          intent: "manual-tools" as const,
          action: "renew-proof-of-life" as const,
          title: i18n("refreshTimer"),
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
      : selectedAction === "stop-beneficiary-stream" || selectedAction === "distribute-beneficiaries"
        ? selectedActionRouteExplanation
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
  // The URL wins. This used to fall back to "home" whenever `hasGuidedActivityContext` was
  // false, which threw away `?view=activity` on every cold load of a deep link: the activity
  // query only runs once the wallet is connected AND its address is resolved, so at first
  // paint there is neither a load in flight nor an event to count, and a wallet whose history
  // is empty never gains one. The title (from the same URL) read "Activity" while the panel
  // showed Wallet home. Clicking Activity still cannot land on an empty tab: the sidebar
  // entry only renders with `hasGuidedActivityContext`, and `openGuidedOverview` clamps the
  // section before it writes the URL, so nothing puts "transactions" in the URL by accident.
  // Asking for it explicitly is answered by the view's own "No activity yet" state.
  const resolvedGuidedOverviewSection = guidedOverviewSection;
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
