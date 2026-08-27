"use client";
import { useTranslations } from "next-intl";

import { sharedReferenceActionDisabledAtom, sharedReferenceActionLabelAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { sharedReferenceBusyAtom, sharedReferencePreviewAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";

import {
  Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function SetupCheckpointCardView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceSetupCheckpointView");
  const state = useWorkspaceActions();
  const sharedReferenceActionLabel = useAtomValue(sharedReferenceActionLabelAtom);
  const sharedReferenceActionDisabled = useAtomValue(sharedReferenceActionDisabledAtom);
  const sharedReferencePreview = useAtomValue(sharedReferencePreviewAtom);
  const sharedReferenceBusy = useAtomValue(sharedReferenceBusyAtom);
  const {
    createInlineSharedReference,
    setupCheckpoint,
  } = state;
    if (setupCheckpoint === "ready") {
      return null;
    }

    if (setupCheckpoint === "wallet") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">{i18n("connectAWalletFirst")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n("connectABrowserWalletOnPreprodSoEpora")}
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "network") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">{i18n("switchToPreprod")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n("theConnectedWalletIsOnADifferentNetwork")}
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "shared-reference") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">{i18n("oneTimeSetupNeeded")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n("approveOneSetupTransactionEporaReusesItsShared")}
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
                {i18n("approveThisOneTimeTransactionInYourConnected")}
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-sm font-medium text-foreground">{i18n("loadFundPools")}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {i18n("noSpendableFundPoolsAreLoadedRefreshThis")}
        </p>
      </div>
    );
}
