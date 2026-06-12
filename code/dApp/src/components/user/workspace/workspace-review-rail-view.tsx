"use client";
import { activeBuildAtom, activeSubmitAtom, buildErrorAtom, buildErrorDetailsAtom, previewAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { selectedWizardActionDescriptorAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { useAtomValue } from "jotai";

import { ReviewDock } from "@/components/user/proposals/review-dock";
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
                  canSaveProposal={Boolean(
                    // eslint-disable-next-line react-hooks/refs -- render-time read of the proposal-capture ref
                    preview?.txHex && previewMatchesSelectedAction && proposalCaptureRef.current
                  )}
                  onSaveProposal={handleSaveProposalFromBuild}
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
