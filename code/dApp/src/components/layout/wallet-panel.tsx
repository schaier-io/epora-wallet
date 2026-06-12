"use client";

import { type ReactNode } from "react";
import type { Wallet } from "@meshsdk/core";
import {
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Wallet2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PopupDialog } from "@/components/ui/popup-dialog";
import { MobileWalletSection } from "@/components/layout/wallet-connect-section";
import { cn } from "@/lib/utils/cn";
import {
  shortenIdentifier
} from "@/lib/utils/explorer";
import { DEMO_WALLET_ID, useWalletContext } from "@/providers/wallet-provider";

export function shortenAddress(value: string | null) {
  return shortenIdentifier(value, 12, 8);
}

function resolveWalletBrand(wallet: Wallet) {
  const normalized = `${wallet.id} ${wallet.name}`.toLowerCase();

  if (normalized.includes("eternl")) {
    return {
      label: "E",
      classes: "border-sky-400/40 bg-sky-500/15 text-sky-200"
    };
  }

  if (normalized.includes("lace")) {
    return {
      label: "L",
      classes: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
    };
  }

  if (normalized.includes("nami")) {
    return {
      label: "N",
      classes: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200"
    };
  }

  if (normalized.includes("vespr")) {
    return {
      label: "V",
      classes: "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
    };
  }

  if (normalized.includes("flint")) {
    return {
      label: "F",
      classes: "border-orange-400/40 bg-orange-500/15 text-orange-200"
    };
  }

  if (normalized.includes("yoroi")) {
    return {
      label: "Y",
      classes: "border-amber-400/40 bg-amber-500/15 text-amber-200"
    };
  }

  if (normalized.includes("typhon")) {
    return {
      label: "T",
      classes: "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
    };
  }

  if (normalized.includes("gero")) {
    return {
      label: "G",
      classes: "border-rose-400/40 bg-rose-500/15 text-rose-200"
    };
  }

  if (normalized.includes("nufi")) {
    return {
      label: "Nu",
      classes: "border-violet-400/40 bg-violet-500/15 text-violet-200"
    };
  }

  if (normalized.includes("begin")) {
    return {
      label: "B",
      classes: "border-teal-400/40 bg-teal-500/15 text-teal-200"
    };
  }

  if (normalized.includes("demo")) {
    return {
      label: "D",
      classes: "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
    };
  }

  return {
    label: wallet.name.slice(0, 1).toUpperCase() || "W",
    classes: "border-border/70 bg-muted/30 text-foreground"
  };
}

export function WalletBrandIcon({
  wallet,
  className
}: {
  wallet: Wallet;
  className?: string;
}) {
  const walletWithIcon = wallet as Wallet & { icon?: string };

  if (walletWithIcon.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={walletWithIcon.icon}
        alt={`${wallet.name} icon`}
        className={cn(
          "block h-9 w-9 shrink-0 rounded-xl border border-border/70 object-cover",
          className
        )}
      />
    );
  }

  const brand = resolveWalletBrand(wallet);

  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold",
        brand.classes,
        className
      )}
      aria-hidden="true"
    >
      {brand.label}
    </span>
  );
}

type WalletConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeOnConnect?: boolean;
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
};

export function WalletConnectionDialog({
  open,
  onOpenChange,
  closeOnConnect = true,
  title,
  description,
  className,
  children
}: WalletConnectionDialogProps) {
  const {
    installedWallets,
    activeWalletName,
    connectingWalletName,
    networkId,
    isConnecting,
    isDemoWallet,
    connectWallet,
    cancelConnect,
    disconnectWallet,
    refreshWallets
  } = useWalletContext();
  const availableExtensionWallets = installedWallets.filter((wallet) => wallet.id !== DEMO_WALLET_ID);
  const hasOnlyDemoWallet = availableExtensionWallets.length === 0 && installedWallets.length > 0;
  const connectingWalletLabel =
    installedWallets.find((wallet) => wallet.id === connectingWalletName)?.name ??
    connectingWalletName;

  const resolvedTitle = title ?? (activeWalletName ? "Change connected wallet" : "Connect wallet");
  const resolvedDescription =
    description ??
    "Choose the browser wallet you want to use for this app.";

  const networkBadgeVariant =
    networkId === null ? "outline" : networkId === 0 ? "secondary" : "warning";
  const networkBadgeLabel =
    networkId === null
      ? "Disconnected"
      : networkId === 0
        ? "Preprod / Testnet"
        : "Mainnet";
  const guidedSteps = Boolean(children);
  // When switching wallets (children present) while already connected, the
  // browser-connect + WalletConnect sections are redundant — show only the
  // user's smart wallets.
  const connectedSwitcher = guidedSteps && Boolean(activeWalletName);

  return (
    <PopupDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-connect should abort the attempt, not leave it pending.
        if (!next && isConnecting) {
          cancelConnect();
        }
        onOpenChange(next);
      }}
      title={resolvedTitle}
      description={resolvedDescription}
      className={cn("max-w-2xl", className)}
    >
      <div className="space-y-6">
        {!connectedSwitcher ? (
        <section className="space-y-3">
          <div className="flex gap-3">
            {guidedSteps ? (
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-xs font-bold text-primary"
                aria-hidden="true"
              >
                1
              </span>
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Browser wallet
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {guidedSteps
                  ? "Use a Cardano browser wallet here to approve wallet actions."
                  : "Connect a browser wallet to create and confirm wallet actions."}
              </p>
            </div>
          </div>

            <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/25 to-background/40 p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant={networkBadgeVariant}>{networkBadgeLabel}</Badge>
                {isDemoWallet ? <Badge variant="outline">Demo read-only</Badge> : null}
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshWallets()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh list
                </Button>
                {activeWalletName ? (
                  <Button type="button" variant="secondary" size="sm" onClick={disconnectWallet}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                ) : null}
              </div>
            </div>
            {isConnecting ? (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-muted-foreground">
                <p className="text-foreground">
                  Check the {connectingWalletLabel ?? "wallet"} extension popup and approve the
                  connection.
                </p>
                <details className="mt-2 rounded-lg border border-border/60 bg-background/45 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-foreground">
                    Connection help
                  </summary>
                  <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                    <p>
                      Unlock the extension, then click its browser-toolbar icon if no popup opens.
                    </p>
                    <p>
                      Make sure this site is allowed in the wallet extension and that the wallet is
                      on Preprod.
                    </p>
                    <p>After changing extension permissions, use Refresh list and try again.</p>
                  </div>
                </details>
              </div>
            ) : null}

            {installedWallets.length === 0 ? (
              <div className="mt-4 flex flex-col gap-4 rounded-xl border border-dashed border-border/70 bg-background/45 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
                <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-muted/35 sm:mx-0">
                  <Wallet2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-2 text-center sm:text-left">
                  <p className="text-sm font-semibold text-foreground">No extension detected</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Install a Cardano wallet for your browser—popular options include{" "}
                    <span className="text-foreground/90">Lace</span>,{" "}
                    <span className="text-foreground/90">Eternl</span>,{" "}
                    <span className="text-foreground/90">Nami</span>,{" "}
                    <span className="text-foreground/90">Vespr</span>, and{" "}
                    <span className="text-foreground/90">Flint</span>. After installing, enable the
                    extension for this site and tap <span className="font-medium text-foreground">Refresh list</span>{" "}
                    above.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {hasOnlyDemoWallet ? (
                  <div className="rounded-xl border border-dashed border-cyan-400/30 bg-cyan-500/8 p-4">
                    <p className="text-sm font-semibold text-foreground">No extension detected</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      You can open the demo wallet to browse the interface without an extension.
                      Creating and confirming wallet actions still requires a real browser wallet
                      such as Lace, Eternl, Nami, Vespr, or Flint.
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                {installedWallets.map((wallet) => {
                  const active = wallet.id === activeWalletName;
                  const connecting = wallet.id === connectingWalletName;
                  const isDemoOption = wallet.id === DEMO_WALLET_ID;

                  return (
                    <button
                      key={wallet.id}
                      type="button"
                      disabled={isConnecting}
                      aria-busy={connecting || undefined}
                      aria-pressed={active || undefined}
                      onClick={() => {
                        void (async () => {
                          try {
                            await connectWallet(wallet.id);
                            if (closeOnConnect) {
                              onOpenChange(false);
                            }
                          } catch {
                            // The provider surfaces the connection error toast.
                          }
                        })();
                      }}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        active
                          ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
                          : "border-border/70 bg-background/60 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background/80",
                        isConnecting && !connecting && "cursor-not-allowed opacity-70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <WalletBrandIcon wallet={wallet} />
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-medium text-foreground">{wallet.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{wallet.id}</p>
                          </div>
                        </div>
                        <Badge variant={active ? "secondary" : "outline"} className="shrink-0 whitespace-nowrap">
                          {active
                            ? "Connected"
                            : connecting
                              ? "Connecting"
                              : isDemoOption
                                ? "Open demo"
                                : "Connect"}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        {connecting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PlugZap className="h-3.5 w-3.5" />
                        )}
                        {active
                          ? isDemoOption
                            ? "Demo mode is active. Confirming actions stays disabled."
                            : "Active for this session."
                          : isDemoOption
                            ? "Browse the app without a wallet extension."
                            : "Use to confirm wallet actions."}
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        </section>
        ) : null}

        {!connectedSwitcher ? (
          <MobileWalletSection
            variant={availableExtensionWallets.length === 0 ? "primary" : "secondary"}
          />
        ) : null}

        {children ? (
          connectedSwitcher ? (
            <section>{children}</section>
          ) : (
            <section className="border-t border-border/60 pt-6">
              <div className="flex gap-3 sm:gap-4">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/40 text-xs font-bold text-muted-foreground"
                  aria-hidden="true"
                >
                  2
                </span>
                <div className="min-w-0 flex-1">{children}</div>
              </div>
            </section>
          )
        ) : null}
      </div>
    </PopupDialog>
  );
}
