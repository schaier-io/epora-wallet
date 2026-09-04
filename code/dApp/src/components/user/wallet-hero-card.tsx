"use client";
import { useTranslations } from "next-intl";


import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  History,
  Send,
  Settings2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, SoftAurora } from "@/components/react-bits/primitives";
import { shortenAddress } from "@/lib/utils/explorer";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import { formatCountLabel } from "@/components/user/workspace/helpers";
import { walletIdentityPalette } from "@/providers/smart-wallet-display";
import { cn } from "@/lib/utils/cn";
import { useId, useState } from "react";

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
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white/95 shadow-[0_4px_14px_-6px_hsl(0_0%_0%/0.6)] ring-1 ring-inset",
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
  const i18n = useTranslations("ComponentsUserWalletHeroCard");
  const compactAddress = address ? shortenAddress(address) : "Loading address…";
  // The full address used to be reachable only through the chip's `title` tooltip, which
  // no keyboard or touch user can open. The toggle below renders it inline instead.
  const [showFullAddress, setShowFullAddress] = useState(false);
  const fullAddressId = useId();
  // A wallet switch can null `address` while the panel is open, so the visible state
  // follows the address instead of trusting the toggle alone.
  const fullAddressVisible = showFullAddress && address !== null;
  const formattedBalance = formatLovelaceAsAda(balanceLovelace || "0");
  const [wholeAda, fractionAdaRaw = "00"] = formattedBalance.split(".");
  const fractionAda = fractionAdaRaw.padEnd(2, "0");
  const wholeNumber = Number((wholeAda || "0").replace(/[^0-9-]/g, "")) || 0;
  // A wallet holding nothing used to say "Only ADA inside this wallet" under a balance of
  // 0.00, because the caller clamped the count to 1 to keep this branch off "0 assets". The
  // empty case now has its own sentence, so the caller can pass the real count.
  const assetSummary =
    assetTypeCount === 0
      ? i18n("noFundsInThisWalletYet")
      : assetTypeCount === 1
        ? i18n("onlyAdaInsideThisWallet")
        : i18n("value1InsideThisWallet", { value1: formatCountLabel(assetTypeCount, "asset") });
  const fundingSummary =
    fundingSourceCount > 1
      ? i18n("acrossValue1", { value1: formatCountLabel(fundingSourceCount, "fundPool") })
      : "";

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-primary/20 p-3 sm:p-4 shadow-[0_18px_42px_-28px_hsl(var(--brand-teal)/0.42)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 18% 18%, hsl(var(--brand-teal) / 0.16), transparent 46%), radial-gradient(circle at 82% 82%, hsl(var(--brand-cyan) / 0.14), transparent 50%), linear-gradient(135deg, hsl(195 50% 5%), hsl(186 40% 8%))"
      }}
    >
      <SoftAurora className="opacity-70" />
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="eyebrow font-semibold text-primary/80">
            {i18n("smartWallet")}
          </p>
          <div className="flex min-w-0 items-center gap-3">
            <WalletIdentityOrb
              seed={identitySeed ?? address ?? walletName}
              size={36}
              initial={walletName}
              className="animate-[tile-bump_540ms_cubic-bezier(0.22,1,0.36,1)]"
            />
            {/*
              `h3`, matching the `CardTitle` of the card this sits inside. As an `h2` it
              outranked its own container: the screen read h1, then h3 "Wallet home", then h2
              "Smart wallet" nested inside that h3. Heading navigation went forwards, then
              backwards into a child.
            */}
            <h3
              className="font-display truncate text-xl font-medium tracking-[-0.015em] text-foreground md:text-2xl"
              title={walletName}
            >
              {walletName}
            </h3>
          </div>
          <div className="flex w-fit items-center gap-1">
            <button
              key={addressCopied ? "copied" : "idle"}
              type="button"
              onClick={onCopyAddress}
              disabled={!address}
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-emerald-300/40 hover:text-foreground disabled:cursor-not-allowed",
                addressCopied &&
                  "animate-[copy-pulse_600ms_cubic-bezier(0.22,1,0.36,1)] text-emerald-200"
              )}
              aria-label={addressCopied ? i18n("walletAddressCopied") : i18n("copyWalletAddress")}
            >
              <span className="font-mono">{compactAddress}</span>
              {addressCopied ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-300 animate-[copy-pop_320ms_cubic-bezier(0.22,1,0.36,1)]" />
              ) : (
                <Copy className="h-3 w-3 transition-colors group-hover:text-foreground" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowFullAddress((open) => !open)}
              disabled={!address}
              aria-expanded={fullAddressVisible}
              aria-controls={fullAddressId}
              aria-label={fullAddressVisible ? i18n("hideFullAddress") : i18n("showFullAddress")}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
            >
              {fullAddressVisible ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {fullAddressVisible ? (
            <p
              id={fullAddressId}
              className="max-w-md select-all break-all font-mono text-xs leading-relaxed text-muted-foreground"
            >
              {address}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <p className="eyebrow text-muted-foreground">
            {i18n("balance")}
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
                  className="font-display text-4xl font-medium tracking-[-0.025em] text-foreground tabular-nums"
                />
                <span className="font-display text-2xl font-medium tracking-[-0.02em] text-muted-foreground tabular-nums">
                  .{fractionAda}
                </span>
                <span className="font-display ml-1 text-base font-medium italic text-muted-foreground/90">
                  ₳
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground/90">
            {assetSummary}
            {fundingSummary}
          </p>
        </div>
      </div>
      <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-4">
        <Button type="button" onClick={onSend} className="justify-center">
          <Send className="h-4 w-4" />
          {i18n("send")}
        </Button>
        <Button type="button" variant="outline" onClick={onReceive} className="justify-center">
          <Download className="h-4 w-4" />
          {i18n("addFunds")}
        </Button>
        <Button type="button" variant="outline" onClick={onActivity} className="justify-center">
          <History className="h-4 w-4" />
          {i18n("activity")}
        </Button>
        <Button type="button" variant="outline" onClick={onSettings} className="justify-center">
          <Settings2 className="h-4 w-4" />
          {i18n("settings")}
        </Button>
      </div>
    </div>
  );
}
