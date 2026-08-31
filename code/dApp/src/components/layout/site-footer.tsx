"use client";
import { useTranslations } from "next-intl";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";

export function SiteFooter() {
  const i18n = useTranslations("ComponentsLayoutSiteFooter");
  const pathname = usePathname();
  const showWalletHomeLink = pathname !== "/user";

  return (
    <footer className="mt-auto border-t border-border/60 bg-background/40">
      <div className="container flex flex-col gap-3 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:py-4">
        <p className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          {i18n("preprodTestNetworkFundsAndSignaturesStayOn")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="hidden items-center gap-2 sm:inline-flex">
            {i18n("press")}
            {/*
              Bare `rounded` (4px) on purpose, below the 8px radius floor. The floor governs
              controls and panels; this cap has `px-1` and no vertical padding, so it hugs a
              single glyph at about 18px tall. At 8px the corners would eat a quarter of the
              box and read as a pill rather than a key. The shortcuts sheet's caps are
              `min-w-[1.75rem] px-2 py-1`, big enough for the floor, and use `rounded-md`.
            */}
            <kbd className="rounded border border-border/60 bg-background/60 px-1 font-mono text-xs">?</kbd>
            {i18n("forShortcuts")}
          </span>
          {showWalletHomeLink ? (
            <>
              <span aria-hidden="true" className="hidden text-border sm:inline">·</span>
              <Link
                href="/user"
                className="hover:text-foreground focus-visible:outline-none focus-visible:underline"
              >
                {i18n("walletHome")}
              </Link>
            </>
          ) : null}
          {/*
            A separator is visible exactly when the thing before it is. What precedes this
            one is the shortcuts hint, which only exists from `sm` up, unless the Wallet home
            link is also there. Without the branch, `/user` on a phone opened its footer with
            an orphaned separator: "· Catalyst proposal".
          */}
          <span
            aria-hidden="true"
            className={showWalletHomeLink ? "text-border" : "hidden text-border sm:inline"}
          >
            ·
          </span>
          <a
            href="https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground focus-visible:outline-none focus-visible:underline"
          >
            {i18n("catalystProposal")}
          </a>
        </div>
      </div>
    </footer>
  );
}
