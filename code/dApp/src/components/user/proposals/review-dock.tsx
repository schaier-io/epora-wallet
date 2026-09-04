"use client";
import { useTranslations } from "next-intl";

import { useId, type PropsWithChildren } from "react";
import { Loader2, ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReviewDockProps = PropsWithChildren<{
  canSaveProposal: boolean;
  /**
   * Why the transaction is not ready to prepare, or null when it is. The direct action and
   * this one build the same bytes, so anything that blocks one has to block the other.
   */
  blockedReason: string | null;
  preparing: boolean;
  onSaveProposal: () => void;
  /**
   * The multisig path is where a request is the whole point: the direct submit cannot
   * carry the approvals it needs, so the save is promoted to the review's primary
   * action, in a panel that names the arithmetic it files for.
   */
  emphasized?: boolean;
  /** Approval power the wallet's rule asks a signer set to reach. */
  approvalNeeded?: number;
  /** Approval power the wallet's co-signers hold between them. */
  approvalHeld?: number;
}>;

// Wraps the existing review panel and adds the "Save as approval request"
// action beneath it. Kept as its own module so the build-flow integration adds
// no new layout logic to the (over-cap) review panel or workspace component.
//
// The button prepares the transaction itself when no current preview exists.
// Preparing builds the transaction but never signs it: signing is what the
// co-signers do afterwards, on the saved request.
export function ReviewDock({
  canSaveProposal,
  blockedReason,
  preparing,
  onSaveProposal,
  emphasized = false,
  approvalNeeded,
  approvalHeld,
  children
}: ReviewDockProps) {
  const i18n = useTranslations("ComponentsUserProposalsReviewDock");
  // The line under the button is the only place that says this builds a transaction without
  // signing or sending it. Read in DOM order it lands right after the button, but a keyboard
  // user tabbing from control to control never reaches it, and this is a money action.
  const noteId = useId();
  return (
    <div className="flex flex-col gap-2">
      {children}
      {canSaveProposal ? (
        <div
          className={
            emphasized
              ? "space-y-2 rounded-lg border border-primary/40 bg-primary/10 p-3"
              : "space-y-1"
          }
        >
          <Button
            type="button"
            variant={emphasized ? "default" : "outline"}
            className="w-full"
            disabled={preparing || Boolean(blockedReason)}
            aria-busy={preparing}
            aria-describedby={noteId}
            onClick={onSaveProposal}
          >
            {preparing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldPlus className="h-4 w-4" aria-hidden="true" />
            )}
            {preparing ? i18n("preparing") : i18n("saveAsApprovalRequest")}
          </Button>
          <p
            id={noteId}
            className={
              emphasized
                ? "text-xs leading-snug text-foreground/90"
                : "text-xs leading-snug text-muted-foreground"
            }
          >
            {blockedReason ??
              (emphasized && approvalNeeded != null
                ? i18n("multisigRequestNote", {
                    needed: approvalNeeded,
                    held: approvalHeld ?? 0
                  })
                : i18n("preparesTheTransactionAndSavesItForThe"))}
          </p>
        </div>
      ) : null}
    </div>
  );
}
