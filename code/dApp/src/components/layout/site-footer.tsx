"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";

export function SiteFooter() {
  const pathname = usePathname();
  const showWalletHomeLink = pathname !== "/user";

  return (
    <footer className="mt-auto border-t border-border/60 bg-background/40">
      <div className="container flex flex-col gap-3 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          Preprod test network. Funds and signatures stay on preprod, not Cardano mainnet.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            Press
            <kbd className="rounded border border-border/60 bg-background/60 px-1 font-mono text-[10px]">?</kbd>
            for shortcuts
          </span>
          {showWalletHomeLink ? (
            <>
              <span aria-hidden="true" className="hidden text-border sm:inline">·</span>
              <Link
                href="/user"
                className="hover:text-foreground focus-visible:outline-none focus-visible:underline"
              >
                Wallet home
              </Link>
            </>
          ) : null}
          <span aria-hidden="true" className="text-border">·</span>
          <a
            href="https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground focus-visible:outline-none focus-visible:underline"
          >
            Catalyst proposal
          </a>
        </div>
      </div>
    </footer>
  );
}
