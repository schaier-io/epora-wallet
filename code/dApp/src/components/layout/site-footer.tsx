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
          {showWalletHomeLink ? (
            <>
              {/*
                The ring the rest of the shell uses, not `outline-none` plus an underline.
                `focus-visible:outline-none` removed the user agent's own indicator and put
                back a 1px line, which is neither a 2px perimeter nor an equivalent area,
                so the footer was the one place in the chrome where a keyboard user lost the
                focus ring. `rounded-sm` keeps the ring off the glyphs.
              */}
              <Link
                href="/user"
                className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {i18n("walletHome")}
              </Link>
              <span aria-hidden="true" className="text-border">·</span>
            </>
          ) : null}
          <a
            href="https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {i18n("catalystProposal")}
          </a>
        </div>
      </div>
    </footer>
  );
}
