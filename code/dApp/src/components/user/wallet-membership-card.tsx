"use client";

import { Download, Loader2, Share2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProfileCard from "@/components/ProfileCard";
import { Button } from "@/components/ui/button";
import { countSttTokens } from "@/lib/mesh/detection";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils/cn";

// Replicated from wallet-session-profile-card.tsx so the membership card shares
// the exact sparkle surface (full-surface grain mask + empty avatar) without
// coupling the two call sites.
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

const CARD_GRADIENT =
  "linear-gradient(145deg, rgba(10, 31, 45, 0.96) 0%, rgba(19, 74, 84, 0.9) 44%, rgba(18, 48, 78, 0.94) 100%)";

const LOGO_SRC = "/logo-mark.svg";
const POLICY_ID_LENGTH = 56;

// At or below this on-chain mint count, holders get the "Founding member" framing
// — low membership numbers as an early-adopter status signal. Past it the label
// degrades gracefully to a plain member number.
const FOUNDING_MEMBER_LIMIT = 1000;

/**
 * Membership label from the 1-based on-chain wallet number. The number is the
 * count of wallets minted under the shared Epora STT policy, so the first wallet
 * ever is "No. 1" (never 0). e.g. "Founding member · No. 6".
 */
function formatMemberLabel(walletNumber: number) {
  const n = Math.max(1, Math.round(walletNumber));
  return n <= FOUNDING_MEMBER_LIMIT ? `Founding member · No. ${n}` : `Member · No. ${n}`;
}

export type WalletMembershipCardProps = {
  walletName: string;
  /** STT mint policy id used to derive the "wallet number". */
  policyId: string | null;
  /** Full STT unit (policyId + assetNameHex) once chain confirmation lands. */
  sttUnit?: string | null;
  network?: string;
  className?: string;
};

function truncateMiddle(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Best-effort hex → ascii for the STT asset name; falls back to the hex. */
function decodeAssetName(unit: string, policyId: string | null) {
  const assetNameHex =
    policyId && unit.startsWith(policyId) ? unit.slice(POLICY_ID_LENGTH) : unit;
  if (!assetNameHex) {
    return "";
  }
  if (/^[0-9a-fA-F]*$/.test(assetNameHex) && assetNameHex.length % 2 === 0) {
    try {
      let ascii = "";
      for (let i = 0; i < assetNameHex.length; i += 2) {
        const code = Number.parseInt(assetNameHex.slice(i, i + 2), 16);
        if (code < 32 || code > 126) {
          return truncateMiddle(assetNameHex, 10, 8);
        }
        ascii += String.fromCharCode(code);
      }
      return ascii;
    } catch {
      return truncateMiddle(assetNameHex, 10, 8);
    }
  }
  return truncateMiddle(assetNameHex, 10, 8);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function loadLogoMarkup(): Promise<string | null> {
  try {
    const response = await fetch(LOGO_SRC);
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    // Strip XML/DOCTYPE prolog so the markup can be nested inside another SVG.
    const svgStart = text.indexOf("<svg");
    return svgStart === -1 ? null : text.slice(svgStart);
  } catch {
    return null;
  }
}

/**
 * Builds a standalone "membership card" PNG. The on-screen card is the animated
 * ProfileCard (WebGL + CSS masks), which cannot be reliably rasterised without a
 * third-party DOM-capture dependency. Instead we redraw the same brand surface
 * into an SVG, serialise it, and paint it onto a canvas — dependency-free and
 * deterministic across browsers.
 */
async function renderCardPng(options: {
  walletName: string;
  numberLabel: string;
  detailLabel: string;
  network: string;
}): Promise<Blob | null> {
  const { walletName, numberLabel, detailLabel, network } = options;
  const scale = 2;
  const width = 520;
  const height = 320;
  const logoMarkup = await loadLogoMarkup();

  const logoBlock = logoMarkup
    ? `<g transform="translate(40 40)"><svg width="44" height="44" viewBox="0 0 834 938" preserveAspectRatio="xMidYMid meet">${logoMarkup
        .replace(/^<svg[^>]*>/, "")
        .replace(/<\/svg>\s*$/, "")}</svg></g>`
    : "";

  const safeName = escapeXml(walletName);
  const safeNumber = escapeXml(numberLabel);
  const safeDetail = escapeXml(detailLabel);
  const safeNetwork = escapeXml(network);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${
    height * scale
  }" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a1f2d" />
      <stop offset="0.44" stop-color="#134a54" />
      <stop offset="1" stop-color="#12304e" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#14B8A6" />
      <stop offset="1" stop-color="#33CFFF" />
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#33CFFF" stop-opacity="0.32" />
      <stop offset="1" stop-color="#33CFFF" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="specular" cx="0.3" cy="0" r="0.7">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="sheen" x1="0.12" y1="-0.1" x2="0.78" y2="1.1">
      <stop offset="0.3" stop-color="#ffffff" stop-opacity="0" />
      <stop offset="0.46" stop-color="#ffffff" stop-opacity="0.1" />
      <stop offset="0.51" stop-color="#ffffff" stop-opacity="0.4" />
      <stop offset="0.57" stop-color="#bfe6ff" stop-opacity="0.16" />
      <stop offset="0.7" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${
    height - 2
  }" rx="28" fill="url(#surface)" stroke="rgba(51,207,255,0.42)" stroke-width="1.5" />
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="28" fill="url(#glow)" />
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="28" fill="url(#specular)" />
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="28" fill="url(#sheen)" />
  <rect x="14" y="3" width="${width - 28}" height="1.5" rx="0.75" fill="#ffffff" opacity="0.12" />
  ${logoBlock}
  <text x="40" y="100" fill="rgba(255,255,255,0.55)" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" letter-spacing="3" text-transform="uppercase">EPORA WALLET MEMBERSHIP</text>
  <text x="40" y="158" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="40" font-weight="700">${safeName}</text>
  <text x="40" y="196" fill="#33CFFF" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="600">${safeNumber}</text>
  <line x1="40" y1="234" x2="${width - 40}" y2="234" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
  <text x="40" y="266" fill="rgba(255,255,255,0.62)" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13">${safeNetwork}</text>
  <text x="40" y="288" fill="rgba(255,255,255,0.45)" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">${safeDetail}</text>
  <rect x="${width - 84}" y="252" width="44" height="6" rx="3" fill="url(#accent)" />
</svg>`;

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to rasterise membership card."));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function WalletMembershipCard({
  walletName,
  policyId,
  sttUnit,
  network = "Preprod",
  className
}: WalletMembershipCardProps) {
  const toast = useToast();
  const [walletNumber, setWalletNumber] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const displayName = walletName.trim() || "Smart wallet";

  // Wallet "number" = count of assets under the STT policy at mint time. Loaded
  // asynchronously so it never blocks the success screen; failures degrade to
  // "Epora Wallet" rather than surfacing an error.
  useEffect(() => {
    if (!policyId) {
      return;
    }
    let cancelled = false;
    void countSttTokens(policyId)
      .then((count) => {
        if (!cancelled && Number.isFinite(count) && count > 0) {
          setWalletNumber(count);
        }
      })
      .catch(() => {
        // Silent: the card renders without a number.
      });
    return () => {
      cancelled = true;
    };
  }, [policyId, sttUnit]);

  const numberLabel =
    walletNumber != null ? formatMemberLabel(walletNumber) : "Founding member";

  const detailLabel = useMemo(() => {
    if (sttUnit) {
      const assetName = decodeAssetName(sttUnit, policyId);
      return assetName ? `STT · ${assetName}` : `STT · ${truncateMiddle(sttUnit)}`;
    }
    return "Permission-based smart wallet";
  }, [policyId, sttUnit]);

  const shareText = useMemo(() => {
    const rank = walletNumber != null ? ` (${formatMemberLabel(walletNumber)})` : "";
    return `${displayName} — my permission-based smart wallet on Cardano ${network}${rank}.`;
  }, [displayName, network, walletNumber]);

  const fileSlug = useMemo(() => {
    const base =
      walletNumber != null
        ? `wallet-${walletNumber}`
        : displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `smart-wallet-${base || "card"}`;
  }, [displayName, walletNumber]);

  // Reuse one rendered PNG blob for both Save and Share within a click.
  const buildPngBlob = useCallback(
    () =>
      renderCardPng({
        walletName: displayName,
        numberLabel,
        detailLabel,
        network
      }),
    [detailLabel, displayName, network, numberLabel]
  );

  const handleSave = useCallback(async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const blob = await buildPngBlob();
      if (!blob) {
        throw new Error("Could not generate the image.");
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileSlug}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success({
        title: "Card saved",
        description: `Downloaded ${fileSlug}.png`
      });
    } catch (error) {
      toast.error({
        title: "Couldn't save the card",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  }, [buildPngBlob, fileSlug, isSaving, toast]);

  const handleShare = useCallback(async () => {
    if (isSharing) {
      return;
    }
    setIsSharing(true);
    try {
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      const blob = await buildPngBlob().catch(() => null);

      // Preferred path: native share sheet with the PNG attached.
      if (nav?.share && blob) {
        const file = new File([blob], `${fileSlug}.png`, { type: "image/png" });
        if (!nav.canShare || nav.canShare({ files: [file] })) {
          try {
            await nav.share({
              files: [file],
              title: displayName,
              text: shareText
            });
            return;
          } catch (error) {
            // AbortError = user dismissed the sheet; treat as a no-op.
            if (error instanceof DOMException && error.name === "AbortError") {
              return;
            }
            // Otherwise fall through to text/clipboard fallbacks.
          }
        }
      }

      // Text-only share sheet (no file support).
      if (nav?.share) {
        try {
          await nav.share({ title: displayName, text: shareText });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
      }

      // Final fallback: copy a short blurb to the clipboard.
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(shareText);
        toast.success({
          title: "Copied to clipboard",
          description: "Share text copied — paste it anywhere."
        });
        return;
      }

      toast.info({
        title: "Sharing not supported",
        description: "Use Save to download the card instead."
      });
    } catch (error) {
      toast.error({
        title: "Couldn't share the card",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setIsSharing(false);
    }
  }, [buildPngBlob, displayName, fileSlug, isSharing, shareText, toast]);

  return (
    <div className={cn("flex w-full flex-col items-center gap-4", className)}>
      <ProfileCard
        avatarUrl={EMPTY_AVATAR_URL}
        iconUrl={FULL_SURFACE_MASK_URL}
        grainUrl={ORIGINAL_GRAIN_URL}
        innerGradient={CARD_GRADIENT}
        behindGlowEnabled
        showUserInfo={false}
        enableTilt
        enableMobileTilt={false}
        verticalTiltMode="push"
        className="pc-membership"
        customContent={
          <div className="pc-membership-face pointer-events-none flex h-full w-full flex-col justify-between p-5 text-white">
            <div className="pc-membership-row flex items-center justify-between gap-3">
              <Image
                src={LOGO_SRC}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 drop-shadow-[0_2px_8px_rgba(51,207,255,0.35)]"
                aria-hidden="true"
              />
              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/55">
                Membership
              </span>
            </div>

            <div className="min-w-0 space-y-1.5">
              <h3
                className="truncate text-2xl font-bold leading-tight text-white"
                title={displayName}
              >
                {displayName}
              </h3>
              <p className="font-mono text-sm font-semibold text-[#33CFFF]">{numberLabel}</p>
            </div>

            <div className="space-y-1 border-t border-white/10 pt-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/60">
                {network}
              </p>
              <p className="truncate font-mono text-[11px] text-white/45" title={detailLabel}>
                {detailLabel}
              </p>
            </div>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void handleShare();
          }}
          disabled={isSharing}
        >
          {isSharing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          Share
        </Button>
      </div>
    </div>
  );
}
