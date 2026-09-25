"use client";
import { useTranslations } from "next-intl";


import { CARDANO_NETWORK } from "@/lib/cardano-network";
import Link from "next/link";
import { useState } from "react";
import { FlaskConical, X } from "lucide-react";

/**
 * Persistent beta notice shown below the top nav.
 *
 * Keeps the unaudited mainnet risk visible. Test networks allow dismissal. The user must click to dismiss it. Dismissal is held in
 * in-memory state only (not persisted), so the reminder returns on every full
 * page reload while staying out of the way during client-side navigation.
 */
export function BetaNotice() {
  const i18n = useTranslations("BetaStatus");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && CARDANO_NETWORK !== "mainnet") return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-500/10 text-amber-100"
    >
      <div className="container flex items-center gap-3 py-2 text-sm">
        <FlaskConical className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          {CARDANO_NETWORK === "mainnet" ? i18n("mainnet") : i18n("testnet", { network: CARDANO_NETWORK })}{" "}
          <Link href="/terms" className="rounded-sm font-medium text-amber-50 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
            {i18n("terms")}
          </Link>
        </p>
        {CARDANO_NETWORK !== "mainnet" ? <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-amber-500/40 px-2 py-1 md:min-h-8 font-medium text-amber-50 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {i18n("dismiss")}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button> : null}
      </div>
    </div>
  );
}
