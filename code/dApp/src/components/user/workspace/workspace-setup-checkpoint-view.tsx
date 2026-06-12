"use client";
import { sharedReferenceActionDisabledAtom, sharedReferenceActionLabelAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { sharedReferenceBusyAtom, sharedReferencePreviewAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";

import {
  Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function SetupCheckpointCardView() {
  const state = useWorkspaceActions();
  const sharedReferenceActionLabel = useAtomValue(sharedReferenceActionLabelAtom);
  const sharedReferenceActionDisabled = useAtomValue(sharedReferenceActionDisabledAtom);
  const sharedReferencePreview = useAtomValue(sharedReferencePreviewAtom);
  const sharedReferenceBusy = useAtomValue(sharedReferenceBusyAtom);
  const {
    createInlineSharedReference,
    setupCheckpoint,
    selectedActionSetupCta,
  } = state;
    if (setupCheckpoint === "ready") {
      return null;
    }

    if (setupCheckpoint === "wallet") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">Connect a wallet first</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect a browser wallet on preprod so the workspace can find your smart wallets and
            prepare actions.
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "network") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">Switch to preprod</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This connected wallet is on a different network. Switch it to preprod/testnet, then
            try again.
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "shared-reference") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">One-time setup needed</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedActionSetupCta}. This wallet needs its shared setup helper before this action
            can continue.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                void createInlineSharedReference();
              }}
              disabled={sharedReferenceActionDisabled}
            >
              {sharedReferenceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sharedReferenceActionLabel}
            </Button>
          </div>
          {sharedReferencePreview ? (
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">
                {sharedReferencePreview.preview.summary}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Your wallet will open to approve this helper.
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-sm font-medium text-foreground">Load fund pools</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This action needs wallet funds first. Refresh the selected wallet or choose a different
          action.
        </p>
      </div>
    );
}
