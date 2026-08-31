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
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
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
          <p id={noteId} className="text-xs leading-snug text-muted-foreground">
            {blockedReason ??
              i18n("preparesTheTransactionAndSavesItForThe")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
