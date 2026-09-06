"use client";
import { useTranslations } from "next-intl";

import { lockedContractUtxosLoadingAtom, sharedSttReferenceStoreLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";

import {
  Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function SetupCheckpointCardView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceSetupCheckpointView");
  const state = useWorkspaceActions();
  const helperLoading = useAtomValue(sharedSttReferenceStoreLoadingAtom);
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const {
    refreshSharedSttReferenceStore,
    setupCheckpoint,
  } = state;
    if (setupCheckpoint === "ready") {
      return null;
    }

    if (setupCheckpoint === "wallet") {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <p className="text-sm font-medium text-foreground">{i18n("connectAWalletFirst")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n("connectACardanoWalletOnPreprodSoEpora")}
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "network") {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <p className="text-sm font-medium text-foreground">{i18n("switchToPreprod_803db8")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n("theWalletYouConnectedIsOnADifferent")}
          </p>
        </div>
      );
    }

    if (setupCheckpoint === "shared-reference") {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            {helperLoading ? i18n("checkingSharedHelper") : i18n("oneTimeSetupNeeded")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n("thisWalletNeedsItsSharedSetupHelperBefore")}
          </p>
          {!helperLoading ? (
            <div className="mt-3 space-y-3">
              <Button type="button" onClick={() => {
                void refreshSharedSttReferenceStore().catch(() => undefined);
              }}>
                {i18n("checkAgain")}
              </Button>
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
            {i18n("checkingThisWalletSFunds")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n("thisActionSpendsFromTheWalletSoIt")}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
        <p className="text-sm font-medium text-foreground">{i18n("thisWalletHasNoFundsYet")}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {i18n("thisActionSpendsFromTheWalletSoIt_bbbd72")}
        </p>
      </div>
    );
}
