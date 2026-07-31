"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { Loader2, PlugZap, Wallet2 } from "lucide-react";
import { WalletSessionProfileCard } from "@/components/user/wallet-session-profile-card";
import { WalletConnectionDialog } from "@/components/layout/wallet-panel";
import { cn } from "@/lib/utils/cn";
import { COPY } from "@/lib/copy";
import { useWalletContext } from "@/providers/wallet-provider";

export function TopNav() {
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
  const walletCardTitle = isConnecting
    ? "Connecting browser wallet"
    : activeWalletName
      ? isDemoWallet
        ? "Read-only browse mode"
        : `${networkLabel} signer wallet`
      : "Open wallet connector";
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
            aria-label={`${COPY.brand.name} — home`}
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
            <Link
              href="/user"
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Wallet
            </Link>
            <Link
              href="/user/proposals"
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Proposals
            </Link>
            <Link
              href="/payee"
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Payments to me
            </Link>
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
      </header>
      <WalletConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
