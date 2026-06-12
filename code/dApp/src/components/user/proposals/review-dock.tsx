"use client";
import type { PropsWithChildren } from "react";
import { ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReviewDockProps = PropsWithChildren<{
  canSaveProposal: boolean;
  onSaveProposal: () => void;
}>;

// Wraps the existing review panel and adds the "Save as multi-sig proposal"
// action beneath it. Kept as its own module so the build-flow integration adds
// no new layout logic to the (over-cap) review panel or workspace component.
export function ReviewDock({ canSaveProposal, onSaveProposal, children }: ReviewDockProps) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      {canSaveProposal ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onSaveProposal}
        >
          <ShieldPlus className="h-4 w-4" aria-hidden="true" />
          Save as multi-sig proposal
        </Button>
      ) : null}
    </div>
  );
}
