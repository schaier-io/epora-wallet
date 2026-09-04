"use client";
import { useTranslations } from "next-intl";

import { activeBuildAtom, activeSubmitAtom, buildDiagnosticIdAtom, buildErrorAtom, buildErrorExpectedAtom, buildErrorStaleInputsAtom, previewAtom, submitConfirmedAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { sttStateFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { activeInferredSttStateFormAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { selectedWizardActionDescriptorAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { selectedSigningActionAvailabilityAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { useAtomValue } from "jotai";
import { useState } from "react";

import { getAssetQuantityByUnit, hasFieldErrors } from "@/components/user/workspace/helpers";
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

export function WorkspaceReviewRailView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceReviewRailView");
  const proposalI18n = useTranslations("ComponentsUserProposalsReviewDock");
  const state = useWorkspaceActions();
  const activeBuild = useAtomValue(activeBuildAtom);
  const activeSubmit = useAtomValue(activeSubmitAtom);
  const buildError = useAtomValue(buildErrorAtom);
  const buildErrorExpected = useAtomValue(buildErrorExpectedAtom);
  const buildDiagnosticId = useAtomValue(buildDiagnosticIdAtom);
  const buildErrorStaleInputs = useAtomValue(buildErrorStaleInputsAtom);
  const preview = useAtomValue(previewAtom);
  const activeInferredSttStateForm = useAtomValue(activeInferredSttStateFormAtom);
  const walletBalanceSummary = useAtomValue(walletBalanceSummaryAtom);
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectedWizardActionDescriptor = useAtomValue(selectedWizardActionDescriptorAtom);
  const submitHash = useAtomValue(submitHashAtom);
  const signingActions = useAtomValue(selectedSigningActionAvailabilityAtom);
  const sttStateForm = useAtomValue(sttStateFormAtom);
  const submitConfirmed = useAtomValue(submitConfirmedAtom);
  // The review tells the user whose signature the built tx needs. The builders pin
  // it to the change address `setupTransaction` resolved (`setRequiredSigners`),
  // which can differ from `usedAddresses[0]`; before a build exists, the connected
  // address is the best available answer.
  const activeAddress = useAtomValue(activeAddressAtom);
  const previewSignerAddress = preview?.signerAddress ?? activeAddress;
  const {
    actionDrafts,
    activeActionDefinition,
    activeActionDraft,
    activeFieldErrors,
    activeReadinessIssues,
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
  } = state;
  // Same gating as the header funds pill: a loading or failed refresh leaves the cost
  // rows without a balance figure instead of showing a stale or zero one.
  const walletBalanceLovelace = walletBalanceSummary.loading || walletBalanceSummary.error
    ? null
    : getAssetQuantityByUnit(walletBalanceSummary.assets, "lovelace");
  const proposalBlockingIssue = activeReadinessIssues.find((issue) => issue.blocking);
  const proposalBlockedReason = proposalBlockingIssue
    ? `${proposalBlockingIssue.description}${
        proposalBlockingIssue.recovery ? ` ${proposalBlockingIssue.recovery}` : ""
      } Then this can be saved for the other signers.`
    : hasFieldErrors(activeFieldErrors)
      ? "Fix the highlighted fields first. Then this can be saved for the other signers."
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
  const approvalBlockedReason = proposalBlockedReason ?? approvalPathBlockedReason;
  const approvalActionNote =
    approvalBlockedReason ??
    (approvalThreshold
      ? i18n("approvalRuleNeedsPower", { approvalThreshold })
      : proposalI18n("preparesTheTransactionAndSavesItForThe"));
  const [preparingProposal, setPreparingProposal] = useState(false);
  const [refreshingChainState, setRefreshingChainState] = useState(false);
  const [refreshChainStateFailed, setRefreshChainStateFailed] = useState(false);
  const transactionInFlight = activeBuild === selectedAction || activeSubmit;

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

  // This always rebuilds with the co-signer path. A direct-path preview cannot be reused because
  // the authority redeemer is part of the transaction body.
  async function saveAsApprovalRequest() {
    if (preparingProposal || transactionInFlight) {
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
              className="order-3 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden scroll-mt-20 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-1.5rem)] xl:self-start"
            >
              <div className="user-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
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
                    signerAddress={previewSignerAddress}
                    walletBalanceLovelace={walletBalanceLovelace}
                    buildError={buildError}
                    buildErrorExpected={buildErrorExpected}
                    buildDiagnosticId={buildDiagnosticId}
                    submitHash={submitHash}
                    submitConfirmed={submitConfirmed}
                    lastActionLabel={lastActionDisplayLabel}
                    isBuilding={approvalOnly ? preparingProposal : activeBuild === selectedAction}
                    isSubmitting={activeSubmit}
                    primaryActionLabel={
                      approvalOnly ? approvalActionLabel : reviewPrimaryActionLabel
                    }
                    primaryActionKind={approvalOnly ? "approval" : "direct"}
                    primaryActionDisabled={
                      approvalOnly
                        ? transactionInFlight ||
                          preparingProposal ||
                          Boolean(approvalBlockedReason)
                        : reviewPrimaryActionDisabled
                    }
                    onPrimaryAction={() => {
                      if (approvalOnly) {
                        void saveAsApprovalRequest();
                        return;
                      }
                      void buildAndSubmitSelectedActionTx(
                        signingActions.directAuthorityPath ?? undefined
                      );
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
                      <p role="status" className="text-xs leading-relaxed text-rose-200">
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
