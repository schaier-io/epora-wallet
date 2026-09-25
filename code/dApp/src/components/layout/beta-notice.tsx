"use client";
import { useTranslations } from "next-intl";


import { CARDANO_NETWORK } from "@/lib/cardano-network";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FlaskConical, X } from "lucide-react";

/**
 * Root custom property that holds the notice's rendered height. Other sticky
 * elements add it to the 65px TopNav offset so they stay clear of the notice.
 */
const BETA_NOTICE_HEIGHT_VAR = "--beta-notice-h";

/**
 * Persistent beta notice shown below the top nav.
 *
 * Keeps the unaudited mainnet risk visible. Test networks allow dismissal. The user must click to dismiss it. Dismissal is held in
 * in-memory state only (not persisted), so the reminder returns on every full
 * page reload while staying out of the way during client-side navigation.
 *
 * Sticky under the TopNav (`4rem + 1px`: the `h-16` row plus its 1px `border-b`; rem, not
 * 65px, so it tracks the header when the user raises the browser font size), so
 * the warning stays on screen while the page scrolls. The height goes to
 * `--beta-notice-h` because the text wraps to a different height at each width.
 * `standalone` pins it to the viewport top on the legal pages, which render no TopNav.
 */
export function BetaNotice({ standalone = false }: { standalone?: boolean }) {
  const i18n = useTranslations("BetaStatus");
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hidden = dismissed && CARDANO_NETWORK !== "mainnet";

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty(BETA_NOTICE_HEIGHT_VAR, `${element.offsetHeight}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(BETA_NOTICE_HEIGHT_VAR);
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <div
      ref={ref}
      role="status"
      // Held still during page transitions, like the TopNav (see globals/motion.css).
      style={{ viewTransitionName: "beta-notice" }}
      // Opaque amber (10% over the TopNav's `#091215`), not `bg-amber-500/10`: scrolled
      // content passes underneath a sticky bar and must not show through it. `z-[19]`,
      // one below the TopNav's `z-20`: the open mobile nav panel grows the header past
      // `4rem + 1px` and must paint over the notice, not under it.
      className={`sticky ${standalone ? "top-0" : "top-[calc(4rem+1px)]"} z-[19] border-b border-amber-500/30 bg-[color-mix(in_oklab,var(--color-amber-500)_10%,#091215)] text-amber-100`}
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
