"use client";
import { WalletStateUpdateBanner } from "./wallet-state-update-banner";
import { RecoveryFallbackView } from "./recovery-fallback-view";
import { REVIEW_DONE_DOUBLE_PRESS_GUARD_MS } from "./constants";

import { useTranslations } from "next-intl";

import { activeSubmitAtom, submitPhaseAtom, buildDiagnosticIdAtom, buildErrorAtom, buildErrorExpectedAtom, buildErrorStaleInputsAtom, previewAtom, submitConfirmedAtom, submitConfirmationUnseenAtom, selectedActionSubmitHashAtom, workspaceSessionAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { activeSttStateFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { activeInferredSttStateFormAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { selectedWizardActionDescriptorAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { selectedSigningActionAvailabilityAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { selectedDraftConflictAtom } from "./atoms/workspace-draft-revision.atoms";
import { selectedActionWaitsForWalletStateAtom } from "@/components/user/workspace/atoms/wallet-state-update.atoms";
import { useAtomValue } from "jotai";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";
import { hasFieldErrors } from "@/components/user/workspace/helpers";
import { Button } from "@/components/ui/button";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import {
  ChevronDown,
  RefreshCw
} from "lucide-react";

import {
  UserReviewPanel
} from "@/components/user/review-panel";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceReviewRailView({
  spanFullRowAtLg = false
}: {
  /**
   * Grid auto-placement puts the rail in the first free cell. With the sidebar shown and
   * a composer open, `lg` defines two columns (280px sidebar + main), so the rail landed
   * in row 2, column 1: the whole review panel squeezed into the sidebar's 280px column,
   * measured 280x909 at 1152x800 with the send composer open. The span lays it across
   * both columns instead, matching how it already stacks below `lg`. `xl` takes the span
   * back: there the rail owns its own third column again. The mint flow runs no sidebar
   * and a one-column grid below `xl`, so it must never carry the span.
   */
  spanFullRowAtLg?: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceReviewRailView");
  const proposalI18n = useTranslations("ComponentsUserProposalsReviewDock");
  const state = useWorkspaceActions();
  const activeSubmit = useAtomValue(activeSubmitAtom);
  const submitPhase = useAtomValue(submitPhaseAtom);
  const session = useAtomValue(workspaceSessionAtom);
  const buildError = useAtomValue(buildErrorAtom);
  const buildErrorExpected = useAtomValue(buildErrorExpectedAtom);
  const buildDiagnosticId = useAtomValue(buildDiagnosticIdAtom);
  const buildErrorStaleInputs = useAtomValue(buildErrorStaleInputsAtom);
  const preview = useAtomValue(previewAtom);
  const activeInferredSttStateForm = useAtomValue(activeInferredSttStateFormAtom);
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectedWizardActionDescriptor = useAtomValue(selectedWizardActionDescriptorAtom);
  const submitHash = useAtomValue(selectedActionSubmitHashAtom);
  const signingActions = useAtomValue(selectedSigningActionAvailabilityAtom);
  const sttStateForm = useAtomValue(activeSttStateFormAtom);
  const submitConfirmed = useAtomValue(submitConfirmedAtom);
  const submitConfirmationUnseen = useAtomValue(submitConfirmationUnseenAtom);
  // STT-spending actions wait for State; deposits stay available.
  const walletStateUpdating = useAtomValue(selectedActionWaitsForWalletStateAtom);
  const draftConflicts = useAtomValue(selectedDraftConflictAtom);
  const conflictTasks = [...new Set(draftConflicts.map(field =>
    field === "users" ? i18n("draftConflictPeople")
      : field.startsWith("multiSig") ? i18n("draftConflictApprovals")
      : field === "beneficiaries" || field.startsWith("proofOfLife") ? i18n("draftConflictRecovery")
      : field === "streamingPayments" ? i18n("draftConflictSchedules")
      : field === "walletName" ? i18n("draftConflictWalletName") : i18n("draftConflictWalletRules")))];
  const {
    actionDrafts,
    activeActionDefinition,
    activeActionDraft,
    activeFieldErrors,
    activeReadinessIssues,
    blockingFieldErrors,
    blockingReadinessIssues,
    buildAndSubmitSelectedActionTx,
    buildSelectedActionTx,
    handleSaveProposalFromBuild,
    lastActionDisplayLabel,
    previewMatchesSelectedAction,
    refreshWorkspaceSummary,
    reviewContextRows,
    reviewPanelDescription,
    reviewReceipt,
    reviewPrimaryActionLabel,
    reviewPrimaryActionDisabled,
    reviewSubmitAwaitingAcknowledgement,
    dismissSubmitState,
  } = state;
  const [preparingProposal, setPreparingProposal] = useState(false);
  const [clickedAction, setClickedAction] = useState<{
    action: typeof selectedAction; session: typeof session;
  } | null>(null);
  const directActionPending = clickedAction?.action === selectedAction && clickedAction.session === session;
  // Pressing "Done" re-arms the rail under the cursor, so the second click of a
  // double-click would land on a live action button: drop it instead of building.
  const acknowledgedAtRef = useRef(0);
  const justAcknowledged = () => Date.now() - acknowledgedAtRef.current < REVIEW_DONE_DOUBLE_PRESS_GUARD_MS;

  // One press builds (or reuses the still-current prepared transaction) and then
  // signs; the wallet prompt is the confirmation step.
  async function runDirectAction() {
    if (justAcknowledged() || directActionPending || preparingProposal || activeSubmit || walletStateUpdating || reviewPrimaryActionDisabled) return;
    const click = { action: selectedAction, session };
    setClickedAction(click);
    try {
      await buildAndSubmitSelectedActionTx(signingActions.directAuthorityPath ?? undefined);
    } finally {
      setClickedAction(current => current === click ? null : current);
    }
  }

  const transactionInFlight = directActionPending || activeSubmit || walletStateUpdating;
  const directActionInFlight = !preparingProposal && transactionInFlight;
  // The RAW pair, not the display-gated one: this reason disables the approval CTA, so
  // reading the gated pair would arm "Save as approval request" over a pristine invalid
  // draft. `activeFieldErrors` / `activeReadinessIssues` stay gated for what is shown.
  const proposalBlockingIssue = blockingReadinessIssues.find((issue) => issue.blocking);
  // Both sentences were English literals here. The i18n migrator only reads JSX, so a
  // string built in the component body ships untranslated and `i18n:check` never sees it.
  // The issue text stays a placeholder: it is data the readiness gate produced, not copy.
  const proposalBlockedReason = proposalBlockingIssue
    ? proposalBlockingIssue.recovery
      ? i18n("proposalBlockedWithRecovery", {
          description: proposalBlockingIssue.description,
          recovery: proposalBlockingIssue.recovery
        })
      : i18n("proposalBlocked", { description: proposalBlockingIssue.description })
    : hasFieldErrors(blockingFieldErrors)
      ? i18n("fixHighlightedFieldsBeforeSaving")
      : null;
  const approvalThreshold =
    activeInferredSttStateForm.multiSigThresholdMode === "some"
      ? activeInferredSttStateForm.multiSigThreshold.trim()
      : "";
  const approvalPathBlockedReason =
    selectedAction === "update-state" &&
    normalizeWalletName(sttStateForm.walletName) !==
      normalizeWalletName(activeInferredSttStateForm.walletName)
      ? i18n("approvalRequestsCannotRenameThisWallet")
      : null;
  const approvalBlockedReason = directActionInFlight
    ? i18n("directActionInFlight")
    : proposalBlockedReason ?? approvalPathBlockedReason;
  const approvalActionNote =
    approvalBlockedReason ??
    (approvalThreshold
      ? i18n("approvalRuleNeedsPower", { approvalThreshold })
      : proposalI18n("preparesTheTransactionAndSavesItForThe"));
  const [refreshingChainState, setRefreshingChainState] = useState(false);
  const [refreshChainStateFailed, setRefreshChainStateFailed] = useState(false);

  // Focused recovery for a stale fund pool: reload what the chain actually holds
  // (fund pools, token summaries). It never rebuilds, signs, or resubmits anything,
  // and the draft stays exactly as the user left it. A rejected refresh keeps the
  // recovery card up with a retry message; the pools stay stale, nothing else moves.
  async function refreshChainState() {
    if (refreshingChainState) {
      return;
    }
    setRefreshingChainState(true);
    setRefreshChainStateFailed(false);
    try {
      await refreshWorkspaceSummary(false);
    } catch {
      setRefreshChainStateFailed(true);
    } finally {
      setRefreshingChainState(false);
    }
  }

  // Request the co-signer path. The shared build record reuses only the same authority.
  async function saveAsApprovalRequest() {
    // `approvalBlockedReason` is the same reason the CTA renders disabled, checked here
    // too so the handler is not the one control on this rail whose only guard is a DOM
    // attribute. `runDirectAction` above already re-checks its own disabled reason.
    if (justAcknowledged() || preparingProposal || transactionInFlight || approvalBlockedReason) {
      return;
    }
    setPreparingProposal(true);
    try {
      const prepared = await buildSelectedActionTx("multisig");
      if (prepared?.txHex) {
        handleSaveProposalFromBuild(prepared.txHex);
      }
    } finally {
      setPreparingProposal(false);
    }
  }

  const approvalOnly =
    signingActions.canSaveApprovalRequest && !signingActions.canDirectSign;
  const showApprovalSecondary =
    signingActions.canDirectSign && signingActions.canSaveApprovalRequest;
  const approvalActionLabel = preparingProposal
    ? proposalI18n("preparing")
    : proposalI18n("saveAsApprovalRequest");

  return (
            <>
            {/* Mobile-only jump-to-confirm: the review stacks at the bottom on
                small screens, so this pins a quick scroll-to-review affordance. */}
            <button
              type="button"
              onClick={() => {
                const anchor = document.getElementById("pw-confirm-anchor");
                if (!anchor) {
                  return;
                }
                anchor.scrollIntoView({ block: "start" });
                // Scrolling alone leaves the keyboard behind. Below `xl` the review is last
                // in DOM order, so without this the next Tab carries on through the form the
                // user just scrolled away from, and the submit button they asked to reach is
                // still the very last stop.
                anchor.focus({ preventScroll: true });
              }}
              aria-label={i18n("scrollToReviewAndConfirm")}
              className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-40 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/40 active:scale-95 xl:hidden"
            >
              {i18n("review")}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <div
              id="pw-confirm-anchor"
              // Focusable by script only, and named, so landing here announces where the
              // jump went instead of an anonymous container.
              tabIndex={-1}
              role="region"
              aria-label={i18n("reviewAndConfirm")}
              // `5rem` from the top clears the sticky TopNav (65px: the `h-16` row plus its
              // 1px `border-b`) with 15px to spare, and the max-height spends the same 80px:
              // 100dvh - 80px top - 8px bottom. The top adds, and the max-height
              // subtracts, `--beta-notice-h`: the sticky BetaNotice below the TopNav.
              className={cn(
                "order-3 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden scroll-mt-[calc(5rem+var(--beta-notice-h,0px))] xl:sticky xl:top-[calc(5rem+var(--beta-notice-h,0px))] xl:max-h-[calc(100dvh-5.5rem-var(--beta-notice-h,0px))] xl:self-start",
                spanFullRowAtLg && "lg:col-span-2 xl:col-span-1"
              )}
            >
              <div className="user-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
                  <WalletStateUpdateBanner blocked={!reviewSubmitAwaitingAcknowledgement} />
                  <UserReviewPanel
                    compact
                    title={i18n("review")}
                    description={reviewPanelDescription}
                    receiptTitle={reviewReceipt.title}
                    receiptSummary={reviewReceipt.summary}
                    receiptItems={reviewReceipt.items}
                    definition={activeActionDefinition}
                    draftSummary={
                      selectedWizardActionDescriptor?.note ?? actionDrafts[selectedAction].summary
                    }
                    draftNextStep={activeActionDraft.nextStep}
                    contextRows={reviewContextRows}
                    readinessIssues={activeReadinessIssues}
                    fieldErrors={activeFieldErrors}
                    preview={preview}
                    previewMatchesSelectedAction={previewMatchesSelectedAction}
                    buildError={buildError}
                    buildErrorExpected={buildErrorExpected}
                    buildDiagnosticId={buildDiagnosticId}
                    submitHash={submitHash}
                    submitConfirmed={submitConfirmed}
                    submitConfirmationUnseen={submitConfirmationUnseen}
                    lastActionLabel={lastActionDisplayLabel}
                    isBuilding={!activeSubmit && (preparingProposal || directActionPending)}
                    autoSignPending={!approvalOnly && directActionPending}
                    isSubmitting={activeSubmit}
                    primaryActionLabel={
                      // Acknowledging a receipt stays available while State updates.
                      reviewSubmitAwaitingAcknowledgement ? reviewPrimaryActionLabel
                        : activeSubmit ? submitPhase === "signing" ? i18n("waitingForWalletSignature")
                          : submitPhase === "submitting" ? i18n("sendingTransaction")
                          : i18n("checkingTransaction")
                        : walletStateUpdating ? i18n("updatingWalletState")
                        : preparingProposal || directActionPending ? i18n("preparingTransaction")
                        : approvalOnly ? approvalActionLabel
                        : reviewPrimaryActionLabel
                    }
                    primaryActionKind={approvalOnly ? "approval" : "direct"}
                    primaryActionDisabled={
                      approvalOnly
                        ? transactionInFlight ||
                          preparingProposal ||
                          Boolean(approvalBlockedReason)
                        : // The "Done" acknowledgement stays live while the wallet-state
                          // wait runs: acknowledging the receipt is not a second
                          // transaction, and the amber banner may be describing exactly
                          // that wait. `runDirectAction` still refuses a real action.
                          directActionPending ||
                          preparingProposal ||
                          (walletStateUpdating && !reviewSubmitAwaitingAcknowledgement) ||
                          reviewPrimaryActionDisabled
                    }
                    onPrimaryAction={() => {
                      if (approvalOnly) {
                        void saveAsApprovalRequest();
                        return;
                      }
                      // "Done" after a one-shot submit: acknowledge the receipt and
                      // re-arm the rail instead of sitting on a dead control.
                      if (reviewSubmitAwaitingAcknowledgement) {
                        acknowledgedAtRef.current = Date.now();
                        dismissSubmitState();
                        return;
                      }
                      void runDirectAction();
                    }}
                    secondaryActionLabel={
                      showApprovalSecondary ? approvalActionLabel : null
                    }
                    secondaryActionDisabled={
                      transactionInFlight ||
                      preparingProposal ||
                      Boolean(approvalBlockedReason)
                    }
                    onSecondaryAction={
                      showApprovalSecondary
                        ? () => void saveAsApprovalRequest()
                        : undefined
                    }
                    approvalActionNote={
                      signingActions.canSaveApprovalRequest ? approvalActionNote : null
                    }
                  />
                {draftConflicts.length > 0 ? (
                  <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    {i18n("draftRulesChanged", { fields: conflictTasks.join(", ") })}
                  </div>
                ) : null}
                <RecoveryFallbackView />
                {buildError && buildErrorStaleInputs ? (
                  <div
                    role="status"
                    className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100"
                  >
                    <p className="leading-relaxed">{i18n("staleChainStateNotice")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={refreshingChainState}
                      aria-busy={refreshingChainState}
                      onClick={() => void refreshChainState()}
                    >
                      <RefreshCw
                        className={refreshingChainState ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                        aria-hidden="true"
                      />
                      {refreshingChainState
                        ? i18n("refreshingChainState")
                        : i18n("refreshChainState")}
                    </Button>
                    {refreshChainStateFailed ? (
                      // No `role="status"` of its own: the wrapper above is already one,
                      // so text appearing inside it is announced. A live region nested in
                      // a live region is announced twice or not at all, depending on the
                      // screen reader.
                      <p className="text-xs leading-relaxed text-rose-200">
                        {i18n("refreshChainStateFailed")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            </>
  );
}
