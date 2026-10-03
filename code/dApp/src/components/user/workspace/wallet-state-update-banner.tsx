"use client";
import { useTranslations } from "next-intl";
import { useAtomValue } from "jotai";
import { ExternalLink, Loader2 } from "lucide-react";

import {
  pendingWalletStateUpdateAtom,
  selectedActionWaitsForWalletStateAtom
} from "@/components/user/workspace/atoms/wallet-state-update.atoms";
import { wizardSelectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { buildCardanoscanTransactionUrl } from "@/components/user/workspace/helpers";
import { shortenIdentifier } from "@/lib/utils/explorer";

// Same width budget as the review rail's submitted-hash chip: 8+6 keeps it on one line.
const HASH_LEADING = 8;
const HASH_TRAILING = 6;

/**
 * Shown above every workspace page while the open wallet waits for a transaction that
 * moved its STT. The wait used to be visible only as a disabled button label in the review
 * rail, so the dashboard and the other pages gave no reason why sending was paused.
 *
 * It names what is held (actions that spend the STT) and what is not (adding funds), so the
 * reader does not take it for a frozen wallet. On a held action page it says that page waits.
 */
export function WalletStateUpdateBanner() {
  const i18n = useTranslations("ComponentsUserWorkspaceWalletStateUpdateBanner");
  const pending = useAtomValue(pendingWalletStateUpdateAtom);
  const actionWaits = useAtomValue(selectedActionWaitsForWalletStateAtom);
  const onActionPage = useAtomValue(wizardSelectedActionAtom) !== null;

  // The live region stays mounted so screen readers announce the banner when it appears;
  // a region inserted together with its text is often not read.
  return (
    <div role="status">
      {pending ? (
        <div className="mb-3 flex items-start gap-3 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-sm">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-200" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-amber-50">{i18n("updatingThisWallet")}</p>
            <p className="text-xs leading-relaxed text-amber-100/85">
              {onActionPage && actionWaits ? i18n("thisActionUnlocksWhenItConfirms") : i18n("sendingAndSettingsPause")}
            </p>
            <a
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
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
