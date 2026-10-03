"use client";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useAtomValue } from "jotai";
import { ExternalLink, Loader2 } from "lucide-react";

import {
  pendingWalletStateUpdateAtom, selectedWalletStateCheckAtom,
  selectedActionWaitsForWalletStateAtom
} from "@/components/user/workspace/atoms/wallet-state-update.atoms";
import { wizardSelectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { buildCardanoscanTransactionUrl } from "@/components/user/workspace/helpers";
import { shortenIdentifier } from "@/lib/utils/explorer";

// Same width budget as the review rail's submitted-hash chip: 8+6 keeps it on one line.
const MILLISECONDS_PER_MINUTE = 60_000;
const HASH_LEADING = 8;
const HASH_TRAILING = 6;

/** Explains a pending wallet-state update beside the action it blocks. */
export function WalletStateUpdateBanner({ blocked = true, compact = false }: { blocked?: boolean; compact?: boolean }) {
  const i18n = useTranslations("ComponentsUserWorkspaceWalletStateUpdateBanner");
  const format = useFormatter();
  const now = useNow({ updateInterval: MILLISECONDS_PER_MINUTE });
  const pendingState = useAtomValue(selectedWalletStateCheckAtom);
  const pending = useAtomValue(pendingWalletStateUpdateAtom);
  const actionWaits = useAtomValue(selectedActionWaitsForWalletStateAtom);
  const onActionPage = useAtomValue(wizardSelectedActionAtom) !== null;

  const showBanner = pending && onActionPage && actionWaits && blocked;

  // The live region stays mounted so screen readers announce the banner when it appears;
  // a region inserted together with its text is often not read.
  return (
    <div role="status" className={showBanner ? undefined : "sr-only"}>
      {showBanner ? (
        <div className={compact ? "flex items-start gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 p-2 text-xs" : "flex items-start gap-3 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-sm"}>
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-200" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-amber-50">{i18n("updatingThisWallet")}</p>
            <p className="text-xs leading-relaxed text-amber-100/85">
              {i18n("thisActionUnlocksWhenItConfirms")}
            </p>
            {!compact ? <a
              href={buildCardanoscanTransactionUrl(pending.submittedTxHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 rounded-md font-mono text-xs text-amber-100/90 underline-offset-4 hover:text-amber-50 hover:underline"
              aria-label={i18n("viewTransactionHashOnCardanoscan", { hash: pending.submittedTxHash })}
            >
              <span className="min-w-0 truncate">
                {shortenIdentifier(pending.submittedTxHash, HASH_LEADING, HASH_TRAILING)}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a> : null}
            {pendingState?.check?.phase === "unavailable" ? <p role="alert" className="text-xs">{i18n("walletStateCheckUnavailable")}</p> : null}
            {!compact && pending?.submittedAt ? <p className="text-xs">{i18n("walletStateSubmittedAt", { time: format.dateTime(pending.submittedAt, "shortWithZone") })}</p> : null}
            {!compact && pending?.submittedAt ? <p className="text-xs">{i18n("walletStateElapsed", { minutes: Math.max(0, Math.floor((now.getTime() - pending.submittedAt) / MILLISECONDS_PER_MINUTE)) })}</p> : null}
            {!compact && pendingState?.check?.lastSuccessfulAt ? <p className="text-xs">{i18n("walletStateLastSuccessfulCheck", { time: format.dateTime(pendingState.check.lastSuccessfulAt, "shortWithZone") })}</p> : null}
            {!compact && pendingState?.check ? <p className="text-xs">{i18n("walletStateLastCheck", { time: format.dateTime(pendingState.check.checkedAt, "shortWithZone") })}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
