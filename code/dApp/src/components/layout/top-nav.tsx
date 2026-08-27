"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { Loader2, PlugZap, Wallet2 } from "lucide-react";
import { WalletSessionProfileCard } from "@/components/user/wallet-session-profile-card";
import { WalletConnectionDialog } from "@/components/layout/wallet-panel";
import { cn } from "@/lib/utils/cn";
import { COPY } from "@/lib/copy";
import { useWalletContext } from "@/providers/wallet-provider";

/**
 * `carriesWallet` marks the destinations that belong to one smart wallet. Without it, a trip
 * to Proposals and back landed on `/user` with no `?wallet`, so the app auto-picked its
 * default and the user silently got a different wallet than the one they left.
 */
const NAV_LINKS = [
  { href: "/user", label: "Wallet", carriesWallet: true },
  { href: "/user/proposals", label: "Approvals", carriesWallet: true },
  // "to you", not "to me". The page this opens heads itself "Scheduled payments to you"
  // in both its `<h1>` and its `metadata.title`, and its own body copy addresses the
  // reader as "you" ("...send to your connected wallet"). The nav was the only first
  // person in the chain, so one link changed person between the label and the heading.
  { href: "/payee", label: "Payments to you", carriesWallet: false }
] as const;

function isNavLinkActive(pathname: string, href: string): boolean {
  // `/user` must not light up while you are on `/user/proposals`, so the root entry matches
  // exactly and the nested ones match their subtree.
  return href === "/user" ? pathname === "/user" : pathname.startsWith(href);
}

function PrimaryNavLinks({ pathname, walletUnit }: { pathname: string; walletUnit: string | null }) {
  return NAV_LINKS.map((link) => {
    const active = isNavLinkActive(pathname, link.href);
    const href =
      link.carriesWallet && walletUnit
        ? `${link.href}?wallet=${encodeURIComponent(walletUnit)}`
        : link.href;

    return (
      <Link
        key={link.href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
          active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {link.label}
      </Link>
    );
  });
}

/**
 * Split out because `useSearchParams` opts its whole subtree into client rendering unless a
 * Suspense boundary contains it, and this nav sits in the root layout. The fallback is the
 * same nav without the wallet carried over, so the links never disappear.
 */
function PrimaryNavWithWallet({ pathname }: { pathname: string }) {
  const walletUnit = useSearchParams().get("wallet");
  return <PrimaryNavLinks pathname={pathname} walletUnit={walletUnit} />;
}

export function TopNav() {
  const pathname = usePathname();
  const {
    activeWalletName,
    installedWallets,
    networkId,
    isDemoWallet,
    isConnecting
  } = useWalletContext();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpen = useCallback(() => setDialogOpen(true), []);

  const networkLabel =
    networkId === null
      ? "Disconnected"
      : networkId === 0
        ? "Preprod"
        : "Mainnet";

  const networkDotClass =
    networkId === 0
      ? "bg-emerald-400 status-dot-live"
      : networkId === 1
        ? "bg-amber-400 status-dot-live"
        : "bg-muted-foreground";
  const activeInstalledWallet = useMemo(
    () => installedWallets.find((wallet) => wallet.id === activeWalletName) ?? null,
    [activeWalletName, installedWallets]
  );
  // All four of these render into a 160px text column at the eyebrow rung, whose 0.16em
  // tracking makes strings much wider than their length suggests. Measured in the browser
  // against that budget: "Read-only browse mode" was 178px, "Connecting browser wallet" 196px
  // and "Open wallet connector" 166px, so three of the four were being cut off. An earlier
  // pass measured and fixed only the signer case, which is why its note sits on that arm.
  const walletCardTitle = isConnecting
    ? "Connecting"
    : activeWalletName
      ? isDemoWallet
        ? "Read-only mode"
        : // "wallet" is dropped: the control already shows a wallet name, and the label
        // has to fit 230px at the eyebrow rung beside it.
        `${networkLabel} signer`
      : "Not connected";
  // The connect shimmer is a "connect me" cue, so it only plays while no wallet
  // is connected. Demo mode counts as connected (read-only), so it stays calm.
  const showConnectShimmer = !activeWalletName && !isDemoWallet;

  return (
    <>
      <header className="relative z-20 border-b border-border/60 bg-[#091215] shadow-[inset_0_-1px_0_#2b464666]">
        <div className="container flex h-16 items-center gap-3 py-2">
          <Link
            href="/user"
            className="group inline-flex shrink-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-sm font-semibold text-[#fafafa] transition-opacity hover:opacity-[0.85] focus-visible:opacity-[0.85] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`${COPY.brand.name}, home`}
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center bg-transparent" aria-hidden="true">
              <Image
                src="/logo-mark.svg"
                alt=""
                width={32}
                height={32}
                priority
                className="h-full w-full transition-transform will-change-transform group-hover:scale-[1.06] group-hover:-rotate-2 group-active:scale-[0.97]"
              />
            </span>
            <span className="hidden min-w-0 flex-col justify-center gap-1 leading-[1.1] sm:flex">
              <span className="inline-flex items-baseline gap-1 font-sans text-base leading-none text-[#fafafa] [font-feature-settings:'ss01','cv11']">
                <span className="font-medium tracking-[-0.005em] text-[#e0e0e0]">{COPY.brand.nameDisplay[0]}</span>
                <span className="font-semibold tracking-[-0.02em] text-[#fafafa]">{COPY.brand.nameDisplay[1]}</span>
              </span>
              <span className="eyebrow hidden max-w-[22rem] truncate font-medium text-[#8ba7a7b2] lg:block">{COPY.brand.tagline}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            <Suspense fallback={<PrimaryNavLinks pathname={pathname} walletUnit={null} />}>
              <PrimaryNavWithWallet pathname={pathname} />
            </Suspense>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "hidden items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] sm:inline-flex",
                networkId === 0
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : networkId === 1
                    ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                    : "border-border/70 bg-background/60 text-muted-foreground"
              )}
              aria-label={`Network status: ${networkLabel}`}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", networkDotClass)} aria-hidden="true" />
              {networkLabel}
            </span>

            <WalletSessionProfileCard
              wallet={activeInstalledWallet}
              walletName={activeInstalledWallet?.name ?? activeWalletName ?? "Connect wallet"}
              title={walletCardTitle}
              primaryActionLabel={activeWalletName ? "Change wallet" : "Connect wallet"}
              onPrimaryAction={handleOpen}
              compact
              forceSimple
              shimmer={showConnectShimmer}
              className={cn("hidden md:inline-flex", isConnecting && "opacity-80")}
            />

            <button
              type="button"
              onClick={handleOpen}
              aria-haspopup="dialog"
              aria-label={activeWalletName ? "Open wallet menu" : "Connect a wallet"}
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 py-1.5 pl-1.5 pr-3 text-foreground",
                "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:border-primary/40 hover:bg-background/60 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "md:hidden",
                isConnecting && "opacity-80"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-primary",
                  activeWalletName ? "bg-primary/15" : "bg-primary/10"
                )}
                aria-hidden="true"
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : activeWalletName ? (
                  <Wallet2 className="h-3.5 w-3.5" />
                ) : (
                  <PlugZap className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="text-xs font-semibold tracking-tight">
                {isConnecting ? "Connecting" : activeWalletName ? "Wallet" : "Connect"}
              </span>
            </button>
          </div>
        </div>

        {/*
          Below `md` the bar has no room for the links beside the logo and the wallet
          button, so they move to their own row rather than disappearing. Three
          destinations do not earn a drawer: a drawer would hide them behind a tap and
          bring a focus trap with it. Only one of the two navs is ever in the
          accessibility tree, because `hidden` is `display:none`.
        */}
        <nav className="container flex flex-wrap items-center gap-1 pb-3 md:hidden" aria-label="Primary">
          <Suspense fallback={<PrimaryNavLinks pathname={pathname} walletUnit={null} />}>
            <PrimaryNavWithWallet pathname={pathname} />
          </Suspense>
        </nav>
      </header>
      <WalletConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
