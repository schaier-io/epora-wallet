"use client";

import {
  CheckCircle2,
  Copy,
  Download,
  History,
  Send,
  Settings2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, SoftAurora } from "@/components/react-bits/primitives";
import { shortenAddress } from "@/components/layout/wallet-panel";
import { formatLovelaceAsAdaRounded } from "@/lib/user-flow/guided-helpers";
import { walletIdentityPalette } from "@/providers/smart-wallet-display";
import { cn } from "@/lib/utils/cn";

/**
 * Deterministic two-tone orb that visually fingerprints the wallet. Same seed
 * always paints the same gradient so users build muscle memory for which orb
 * belongs to which wallet. Sized via `size` prop; defaults to hero scale.
 */
export function WalletIdentityOrb({
  seed,
  size = 40,
  initial,
  className
}: {
  seed: string | null | undefined;
  size?: number;
  initial?: string;
  className?: string;
}) {
  const palette = walletIdentityPalette(seed);
  const ring = `hsl(${palette.hue1} ${palette.sat}% ${Math.min(palette.light + 8, 70)}% / 0.55)`;
  const grad = `radial-gradient(circle at 28% 28%, hsl(${palette.hue1} ${palette.sat}% ${palette.light + 6}%) 0%, hsl(${palette.hue2} ${palette.sat}% ${palette.light - 4}%) 70%, hsl(${palette.hue2} ${palette.sat}% ${Math.max(palette.light - 18, 14)}%) 100%)`;
  const label = (initial ?? "").trim().slice(0, 1).toUpperCase() || "•";
  const fontSize = Math.max(10, Math.round(size * 0.42));
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-[0.1em] text-white/95 shadow-[0_4px_14px_-6px_hsl(0_0%_0%/0.6)] ring-1 ring-inset",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundImage: grad,
        boxShadow: `0 0 0 1px ${ring}, inset 0 0 0 1px hsl(0 0% 100% / 0.06)`,
        fontSize
      }}
    >
      <span className="drop-shadow-[0_1px_1px_hsl(0_0%_0%/0.45)]">{label}</span>
    </span>
  );
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type WalletHeroCardProps = {
  walletName: string;
  address: string | null;
  balanceLovelace: string;
  assetTypeCount: number;
  fundingSourceCount: number;
  loading?: boolean;
  onCopyAddress: () => void;
  addressCopied: boolean;
  onSend: () => void;
  onReceive: () => void;
  onActivity: () => void;
  onSettings: () => void;
  /** Deterministic seed for the identity orb. Usually the locking address. */
  identitySeed?: string | null;
};

export function WalletHeroCard({
  walletName,
  address,
  balanceLovelace,
  assetTypeCount,
  fundingSourceCount,
  loading,
  onCopyAddress,
  addressCopied,
  onSend,
  onReceive,
  onActivity,
  onSettings,
  identitySeed
}: WalletHeroCardProps) {
  const compactAddress = address ? shortenAddress(address) : "Loading address…";
  const formattedBalance = formatLovelaceAsAdaRounded(balanceLovelace || "0", 2);
  const [wholeAda, fractionAdaRaw = "00"] = formattedBalance.split(".");
  const fractionAda = fractionAdaRaw.padEnd(2, "0");
  const wholeNumber = Number((wholeAda || "0").replace(/[^0-9-]/g, "")) || 0;
  const assetSummary =
    assetTypeCount <= 1
      ? "Only ADA inside this wallet"
      : `${formatCountLabel(assetTypeCount, "asset")} inside this wallet`;
  const fundingSummary =
    fundingSourceCount > 1
      ? ` across ${formatCountLabel(fundingSourceCount, "fund pool")}`
      : "";

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-primary/20 p-5 shadow-[0_18px_42px_-28px_hsl(var(--brand-teal)/0.42)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 18% 18%, hsl(var(--brand-teal) / 0.16), transparent 46%), radial-gradient(circle at 82% 82%, hsl(var(--brand-cyan) / 0.14), transparent 50%), linear-gradient(135deg, hsl(195 50% 5%), hsl(186 40% 8%))"
      }}
    >
      <SoftAurora className="opacity-70" />
      <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Smart wallet
          </p>
          <div className="flex min-w-0 items-center gap-3">
            <WalletIdentityOrb
              seed={identitySeed ?? address ?? walletName}
              size={36}
              initial={walletName}
              className="animate-[tile-bump_540ms_cubic-bezier(0.22,1,0.36,1)]"
            />
            <h2
              className="font-display truncate text-xl font-medium tracking-[-0.015em] text-foreground md:text-2xl"
              title={walletName}
            >
              {walletName}
            </h2>
          </div>
          <button
            key={addressCopied ? "copied" : "idle"}
            type="button"
            onClick={onCopyAddress}
            disabled={!address}
            className={cn(
              "group inline-flex w-fit items-center gap-2 rounded-full border border-border/40 bg-background/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-emerald-300/40 hover:text-foreground disabled:cursor-not-allowed",
              addressCopied &&
                "animate-[copy-pulse_600ms_cubic-bezier(0.22,1,0.36,1)] text-emerald-200"
            )}
            title={address ?? undefined}
          >
            <span className="font-mono">{compactAddress}</span>
            {addressCopied ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-300 animate-[copy-pop_320ms_cubic-bezier(0.22,1,0.36,1)]" />
            ) : (
              <Copy className="h-3 w-3 transition-colors group-hover:text-foreground" />
            )}
          </button>
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Balance
          </p>
          <div className="flex items-baseline gap-1">
            {loading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <>
                <CountUp
                  to={wholeNumber}
                  duration={900}
                  decimals={0}
                  className="font-display text-4xl font-medium tracking-[-0.025em] text-foreground tabular-nums md:text-5xl"
                />
                <span className="font-display text-2xl font-medium tracking-[-0.02em] text-muted-foreground tabular-nums md:text-3xl">
                  .{fractionAda}
                </span>
                <span className="font-display ml-1 text-base font-medium italic text-muted-foreground/90">
                  ₳
                </span>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/90">
            {assetSummary}
            {fundingSummary}
          </p>
        </div>
      </div>
      <div className="relative z-10 mt-5 grid gap-2 sm:grid-cols-4">
        <Button type="button" onClick={onSend} className="justify-center">
          <Send className="h-4 w-4" />
          Send
        </Button>
        <Button type="button" variant="outline" onClick={onReceive} className="justify-center">
          <Download className="h-4 w-4" />
          Receive
        </Button>
        <Button type="button" variant="outline" onClick={onActivity} className="justify-center">
          <History className="h-4 w-4" />
          Activity
        </Button>
        <Button type="button" variant="outline" onClick={onSettings} className="justify-center">
          <Settings2 className="h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  );
}
