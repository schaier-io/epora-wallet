"use client";
import { sharedReferenceActionDisabledAtom, sharedReferenceActionLabelAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { lockedContractUtxosLoadingAtom, sharedReferenceBusyAtom, sharedReferencePreviewAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
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
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const {
    createInlineSharedReference,
    setupCheckpoint,
  } = state;
    if (setupCheckpoint === "ready") {
      return null;
    }

    if (setupCheckpoint === "wallet") {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <p className="text-sm font-medium text-foreground">Connect a wallet first</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect a Cardano wallet on Preprod so Epora can find your smart wallets and prepare
            actions.
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "network") {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <p className="text-sm font-medium text-foreground">Switch to preprod</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The wallet you connected is on a different network. Switch it to Preprod, then try
            again.
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "shared-reference") {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <p className="text-sm font-medium text-foreground">One-time setup needed</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This wallet needs its shared setup helper before this action can continue. You
            approve it once, in your wallet, and it is not needed again.
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
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
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

    // `funding` covers two different situations: the fund pools are still being read, or the
    // wallet really is empty. One message for both told a reader whose wallet held nothing to
    // "refresh", and told a reader who was merely waiting that something was wrong.
    if (lockedContractUtxosLoading) {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            Checking this wallet&apos;s funds…
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This action spends from the wallet, so it opens once the funds are read.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
        <p className="text-sm font-medium text-foreground">This wallet has no funds yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This action spends from the wallet, so it needs money in it first. Choose Receive funds
          to add some.
        </p>
      </div>
    );
}
