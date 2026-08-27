"use client";
import { useTranslations } from "next-intl";


import Link from "next/link";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { Loader2, Menu, PlugZap, Wallet2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { WalletSessionProfileCard } from "@/components/user/wallet-session-profile-card";
import { WalletConnectionDialog } from "@/components/layout/wallet-panel";
import { PopupDialog } from "@/components/ui/popup-dialog";
import { cn } from "@/lib/utils/cn";
import { COPY } from "@/lib/copy";
import { useWalletContext } from "@/providers/wallet-provider";

const NAV_ITEMS = [
  { href: "/user", labelKey: "wallet" },
  { href: "/user/proposals", labelKey: "proposals" },
  { href: "/payee", labelKey: "paymentsToMe" }
] as const;

export function isCurrentNavItem(pathname: string, href: string) {
  return href === "/user" ? pathname === href : pathname.startsWith(href);
}

export function TopNav() {
  const i18n = useTranslations("ComponentsLayoutTopNav");
  const pathname = usePathname();
  const {
    activeWalletName,
    installedWallets,
    networkId,
    isDemoWallet,
    isConnecting
  } = useWalletContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleOpen = useCallback(() => setDialogOpen(true), []);

  const networkLabel =
    networkId === null
      ? i18n("disconnected")
      : networkId === 0
        ? i18n("preprod")
        : i18n("mainnet");

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
  const walletCardTitle = isConnecting
    ? i18n("connectingBrowserWallet")
    : activeWalletName
      ? isDemoWallet
        ? i18n("readOnlyBrowseMode")
        : i18n("networklabelSignerWallet", { networkLabel: networkLabel })
      : i18n("openWalletConnector");
  // The connect shimmer is a "connect me" cue, so it only plays while no wallet
  // is connected. Demo mode counts as connected (read-only), so it stays calm.
  const showConnectShimmer = !activeWalletName && !isDemoWallet;

  return (
    <>
      <header className="relative z-20 border-b border-border/60 bg-[#091215] shadow-[inset_0_-1px_0_#2b464666]">
        <div className="container flex h-16 items-center gap-3 py-2 md:h-[68px]">
          <Link
            href="/user"
            className="group inline-flex shrink-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-sm font-semibold text-[#fafafa] transition-opacity hover:opacity-[0.85] focus-visible:opacity-[0.85] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={i18n("value1Home", { value1: COPY.brand.name })}
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
            <span className="hidden min-w-0 flex-col justify-center gap-[0.15rem] leading-[1.1] sm:flex">
              <span className="inline-flex items-baseline gap-[0.35rem] font-sans text-[1.05rem] leading-none text-[#fafafa] [font-feature-settings:'ss01','cv11']">
                <span className="font-medium tracking-[-0.005em] text-[#e0e0e0]">{COPY.brand.nameDisplay[0]}</span>
                <span className="font-semibold tracking-[-0.02em] text-[#fafafa]">{COPY.brand.nameDisplay[1]}</span>
              </span>
              <span className="hidden max-w-[22rem] truncate text-[0.58rem] font-medium uppercase tracking-[0.2em] text-[#8ba7a7b2] lg:block">{COPY.brand.tagline}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const current = isCurrentNavItem(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    current
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  {i18n(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] sm:inline-flex",
                networkId === 0
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : networkId === 1
                    ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                    : "border-border/70 bg-background/60 text-muted-foreground"
              )}
              aria-label={i18n("networkStatusNetworklabel", { networkLabel: networkLabel })}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", networkDotClass)} aria-hidden="true" />
              {networkLabel}
            </span>

            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-haspopup="dialog"
              aria-label={i18n("openNavigationMenu")}
              className={cn(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground md:hidden",
                "transition-[background-color,border-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:border-primary/40 hover:bg-background/60 hover:text-foreground active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>

            <WalletSessionProfileCard
              wallet={activeInstalledWallet}
              walletName={activeInstalledWallet?.name ?? activeWalletName ?? i18n("connectWallet")}
              title={walletCardTitle}
              primaryActionLabel={activeWalletName ? i18n("changeWallet") : i18n("connectWallet")}
              onPrimaryAction={handleOpen}
              compact
              forceSimple
              shimmer={showConnectShimmer}
              className={cn("hidden lg:inline-flex", isConnecting && "opacity-80")}
            />

            <button
              type="button"
              onClick={handleOpen}
              aria-haspopup="dialog"
              aria-label={activeWalletName ? i18n("openWalletMenu") : i18n("connectAWallet")}
              className={cn(
                "group inline-flex min-h-11 items-center gap-2 rounded-full border border-border/60 bg-background/40 py-1.5 pl-1.5 pr-3 text-foreground",
                "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:border-primary/40 hover:bg-background/60 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "lg:hidden",
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
                {isConnecting ? i18n("connecting") : activeWalletName ? i18n("wallet") : i18n("connect")}
              </span>
            </button>
          </div>
        </div>
      </header>
      <PopupDialog
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        title={i18n("navigation")}
        className="max-w-sm"
      >
        <nav className="space-y-2" aria-label={i18n("mobileNavigation")}>
          {NAV_ITEMS.map((item) => {
            const current = isCurrentNavItem(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "flex min-h-12 items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
                  current
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                {i18n(item.labelKey)}
                {current ? (
                  <span className="text-xs font-medium text-primary">{i18n("current")}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </PopupDialog>
      <WalletConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
