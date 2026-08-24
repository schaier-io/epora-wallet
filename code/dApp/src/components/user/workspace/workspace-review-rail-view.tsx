"use client";
import { activeBuildAtom, activeSubmitAtom, buildErrorAtom, buildErrorDetailsAtom, previewAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { selectedWizardActionDescriptorAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { canProposeSelectedActionAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAtomValue } from "jotai";
import { useState } from "react";

import { ReviewDock } from "@/components/user/proposals/review-dock";
import { hasFieldErrors } from "@/components/user/workspace/helpers";
import {
  ChevronDown
} from "lucide-react";

import {
  UserReviewPanel
} from "@/components/user/review-panel";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceReviewRailView() {
  const state = useWorkspaceActions();
  const activeBuild = useAtomValue(activeBuildAtom);
  const activeSubmit = useAtomValue(activeSubmitAtom);
  const buildError = useAtomValue(buildErrorAtom);
  const buildErrorDetails = useAtomValue(buildErrorDetailsAtom);
  const preview = useAtomValue(previewAtom);
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectedWizardActionDescriptor = useAtomValue(selectedWizardActionDescriptorAtom);
  const submitHash = useAtomValue(submitHashAtom);
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
    proposalCaptureRef,
    reviewContextRows,
    reviewPanelDescription,
    reviewReceipt,
    reviewPrimaryActionLabel,
    reviewPrimaryActionDisabled,
  } = state;
  const canProposeSelectedAction = useAtomValue(canProposeSelectedActionAtom);
  // `canProposeSelectedActionAtom` only asks whether this action *can* be proposed at all:
  // an STT flow action, an operator path, a chosen wallet. It says nothing about whether
  // the transaction is ready, so the control stayed armed while the direct button beside it
  // was disabled -- a send with no payout staged could be routed to the co-signers instead.
  // Both build the same bytes, so both answer to the same readiness.
  const proposalBlockingIssue = activeReadinessIssues.find((issue) => issue.blocking);
  const proposalBlockedReason = proposalBlockingIssue
    ? `${proposalBlockingIssue.description} Then this can be saved for the other signers.`
    : hasFieldErrors(activeFieldErrors)
      ? "Fix the highlighted fields first. Then this can be saved for the other signers."
      : null;
  const [preparingProposal, setPreparingProposal] = useState(false);

  // Save-as-request without a signature. When a matching preview already exists the build is
  // reused; otherwise the transaction is built here first. Either way nothing is signed —
  // `buildSelectedActionTx` stops at the unsigned tx, and only `submitTransactionPreview`
  // ever reaches the wallet.
  async function saveAsApprovalRequest() {
    if (preparingProposal) {
      return;
    }
    if (preview?.txHex && previewMatchesSelectedAction && proposalCaptureRef.current) {
      handleSaveProposalFromBuild();
      return;
    }
    setPreparingProposal(true);
    try {
      const prepared = await buildSelectedActionTx();
      if (prepared?.txHex) {
        handleSaveProposalFromBuild(prepared.txHex);
      }
    } finally {
      setPreparingProposal(false);
    }
  }

  return (
            <>
            {/* Mobile-only jump-to-confirm: the review stacks at the bottom on
                small screens, so this pins a quick scroll-to-review affordance. */}
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById("pw-confirm-anchor")
                  ?.scrollIntoView({ block: "start" });
              }}
              aria-label="Scroll to review and confirm"
              className="fixed right-3 top-[4.75rem] z-40 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-3 py-1.5 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/40 active:scale-95 xl:hidden"
            >
              Review
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <div
              id="pw-confirm-anchor"
              className="order-3 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden scroll-mt-20 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-1.5rem)] xl:self-start"
            >
              <div className="user-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
                <ReviewDock
                  canSaveProposal={canProposeSelectedAction}
                  blockedReason={proposalBlockedReason}
                  preparing={preparingProposal}
                  onSaveProposal={() => void saveAsApprovalRequest()}
                >
                  <UserReviewPanel
                    compact
                    title="Review"
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
                    buildErrorDetails={buildErrorDetails}
                    submitHash={submitHash}
                    lastActionLabel={lastActionDisplayLabel}
                    isBuilding={activeBuild === selectedAction}
                    isSubmitting={activeSubmit}
                    primaryActionLabel={reviewPrimaryActionLabel}
                    primaryActionDisabled={reviewPrimaryActionDisabled}
                    onPrimaryAction={() => {
                      void buildAndSubmitSelectedActionTx();
                    }}
                  />
                </ReviewDock>
              </div>
            </div>
            </>
  );
}
