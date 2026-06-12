"use client";

import type { Wallet } from "@meshsdk/core";
import { PlugZap } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import ProfileCard from "@/components/ProfileCard";
import { WalletBrandIcon } from "@/components/layout/wallet-panel";
import { cn } from "@/lib/utils/cn";

const ORIGINAL_GRAIN_URL = "https://reactbits.dev/assets/demo/grain.webp";

const FULL_SURFACE_MASK_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
    <rect width="100" height="100" fill="white" />
  </svg>`
)}`;

const EMPTY_AVATAR_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="none">
    <rect width="10" height="10" fill="#000000" />
  </svg>`
)}`;

export type WalletSessionProfileCardProps = {
  wallet: Wallet | null;
  walletName: string | null;
  /** Shown as the secondary line (replaces former network / status). */
  title?: string;
  primaryActionLabel?: string;
  onPrimaryAction: () => void;
  compact?: boolean;
  /**
   * Force the plain (non-sparkle) presentation. Used in the top navigation,
   * where the animated ProfileCard surface is too busy for a persistent header
   * control; the plain variant keeps a calm dark resting background.
   */
  forceSimple?: boolean;
  /**
   * Whether the attention-drawing connect shimmer should play. Callers pass
   * `false` once a wallet is connected (including read-only demo mode) so the
   * glint only appears while there is no wallet to connect.
   */
  shimmer?: boolean;
  className?: string;
};

function subscribeToBrowserCapabilities() {
  return () => undefined;
}

function getAdvancedWalletCardEffectsSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent;
  const isChromiumLike = /\b(?:Chrome|Chromium|CriOS|Edg|OPR)\b/i.test(userAgent);
  const isFirefoxLike = /\b(?:Firefox|FxiOS)\b/i.test(userAgent);
  const isWebKitLike = /AppleWebKit/i.test(userAgent) && !isChromiumLike && !isFirefoxLike;
  const isOrionBrowser = /\bOrion(?:\/|\b)/i.test(userAgent);
  const supportsAdvancedMasking =
    typeof window.CSS !== "undefined" &&
    typeof window.CSS.supports === "function" &&
    window.CSS.supports("mix-blend-mode", "color-dodge") &&
    (window.CSS.supports("-webkit-mask-image", "linear-gradient(white, white)") ||
      window.CSS.supports("mask-image", "linear-gradient(white, white)"));

  return !isOrionBrowser && !isWebKitLike && supportsAdvancedMasking;
}

function getAdvancedWalletCardEffectsServerSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);

    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return prefersReducedMotion;
}

export function WalletSessionProfileCard({
  wallet,
  walletName,
  title = "Signer wallet",
  primaryActionLabel = "Change wallet",
  onPrimaryAction,
  compact = false,
  forceSimple = false,
  shimmer = true,
  className
}: WalletSessionProfileCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const supportsAdvancedEffects = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    getAdvancedWalletCardEffectsSnapshot,
    getAdvancedWalletCardEffectsServerSnapshot
  );
  const useSimpleEffects = forceSimple || !supportsAdvancedEffects || prefersReducedMotion;
  const displayName = walletName?.trim() || wallet?.name || "Connect wallet";

  if (useSimpleEffects) {
    // Static twin of the animated ProfileCard: same teal/navy gradient, grain
    // glow, and one-shot shimmer (pc-wallet-simple-* in ProfileCard.css), but
    // no WebGL/tilt. Keeps the header control calm while matching the card's
    // resting look exactly. Reduced motion flattens the shimmer (see that file).
    return (
      <button
        type="button"
        onClick={onPrimaryAction}
        aria-label={`${primaryActionLabel}: ${displayName}`}
        className={cn(
          "pc-wallet-simple-button group relative flex min-w-0 items-center gap-3 overflow-hidden border text-left text-white",
          "transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          compact
            ? "h-12 w-[230px] max-w-full rounded-[14px] pl-2 pr-4"
            : "min-h-[60px] w-full rounded-2xl px-3.5 py-2",
          !shimmer && "pc-wallet-simple-button--static",
          className
        )}
      >
        <span className="pc-wallet-simple-glow pointer-events-none absolute inset-0 z-[1] rounded-[inherit]" aria-hidden="true" />
        {wallet ? (
          <WalletBrandIcon
            wallet={wallet}
            className={cn(
              "relative z-[3] shrink-0 !border-white/15 !bg-white/5 !shadow-none",
              compact ? "!h-8 !w-8 !rounded-[10px]" : "!h-9 !w-9 !rounded-[10px]"
            )}
          />
        ) : (
          <span
            className={cn(
              "relative z-[3] inline-flex shrink-0 items-center justify-center border border-white/15 bg-white/5 text-[hsl(var(--brand-cyan))]",
              compact ? "h-8 w-8 rounded-[10px]" : "h-9 w-9 rounded-[10px]"
            )}
          >
            <PlugZap className="h-4 w-4" aria-hidden />
          </span>
        )}

        <span className="relative z-[3] min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-white",
              compact ? "text-sm font-semibold" : "text-base font-semibold"
            )}
            title={displayName}
          >
            {displayName}
          </span>
          <span className="mt-0.5 block truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-white/60">
            {title}
          </span>
        </span>
      </button>
    );
  }

  return (
    <ProfileCard
      avatarUrl={EMPTY_AVATAR_URL}
      iconUrl={FULL_SURFACE_MASK_URL}
      grainUrl={ORIGINAL_GRAIN_URL}
      innerGradient="linear-gradient(145deg, rgba(10, 31, 45, 0.96) 0%, rgba(19, 74, 84, 0.9) 44%, rgba(18, 48, 78, 0.94) 100%)"
      behindGlowEnabled={true}
      showUserInfo={false}
      enableTilt
      enableMobileTilt={false}
      verticalTiltMode="push"
      className={cn("pc-wallet-header", compact && "pc-wallet-header--compact", !shimmer && "pc-wallet-header--static", className)}
      customContent={
        <button
          type="button"
          onClick={onPrimaryAction}
          aria-label={`${primaryActionLabel}: ${displayName}`}
          className="pc-wallet-button"
        >
          <span className="pc-wallet-row pointer-events-none">
            {wallet ? (
              <WalletBrandIcon
                wallet={wallet}
                className="pc-wallet-logo pc-wallet-logo-surface pointer-events-none !h-8 !w-8 !rounded-[12px] !border-white/15"
              />
            ) : (
              <span className="pc-wallet-logo pc-wallet-logo--fallback pointer-events-none">
                <PlugZap className="h-4 w-4" aria-hidden />
              </span>
            )}

            <span className="pc-wallet-text pointer-events-none">
              <span className="pc-wallet-name" title={displayName}>
                {displayName}
              </span>
              <span className="pc-wallet-role">{title}</span>
            </span>
          </span>
        </button>
      }
    />
  );
}
