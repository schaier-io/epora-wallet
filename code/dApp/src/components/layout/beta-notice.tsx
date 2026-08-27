"use client";
import { useTranslations } from "next-intl";


import { useState } from "react";
import { FlaskConical, X } from "lucide-react";

/**
 * Persistent beta notice shown below the top nav.
 *
 * Makes it unmistakable that this is unfinished software and must not be used
 * with real funds. The user must click to dismiss it. Dismissal is held in
 * in-memory state only (not persisted), so the reminder returns on every full
 * page reload while staying out of the way during client-side navigation.
 */
export function BetaNotice() {
  const i18n = useTranslations("ComponentsLayoutBetaNotice");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-500/10 text-amber-100"
    >
      <div className="container flex items-center gap-3 py-2 text-xs sm:text-sm">
        <FlaskConical className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          {i18n.rich("betaWarning", {
            strong: (chunks) => <span className="font-semibold text-amber-50">{chunks}</span>
          })}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={i18n("dismissBetaNotice")}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-amber-500/40 px-3 py-1 font-medium text-amber-50 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {i18n("gotIt")}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
