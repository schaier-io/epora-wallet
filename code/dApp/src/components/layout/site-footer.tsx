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
              <Link
                href="/user"
                className="hover:text-foreground focus-visible:outline-none focus-visible:underline"
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
            className="hover:text-foreground focus-visible:outline-none focus-visible:underline"
          >
            {i18n("catalystProposal")}
          </a>
        </div>
      </div>
    </footer>
  );
}
