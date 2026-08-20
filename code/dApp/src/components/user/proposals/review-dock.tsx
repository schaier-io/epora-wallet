"use client";
import type { PropsWithChildren } from "react";
import { Loader2, ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReviewDockProps = PropsWithChildren<{
  canSaveProposal: boolean;
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
  preparing,
  onSaveProposal,
  children
}: ReviewDockProps) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      {canSaveProposal ? (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={preparing}
            aria-busy={preparing}
            onClick={onSaveProposal}
          >
            {preparing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldPlus className="h-4 w-4" aria-hidden="true" />
            )}
            {preparing ? "Preparing…" : "Save as approval request"}
          </Button>
          <p className="text-xs leading-snug text-muted-foreground">
            Prepares the transaction and saves it for the other signers. Nothing is signed
            and nothing is sent.
          </p>
        </div>
      ) : null}
    </div>
  );
}
