"use client";

import { useMemo, useState } from "react";
import { Coins, Download, Gem, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetIcon } from "@/components/user/asset-icon";
import { resolveAssetIdentity, type KnownAssetMeta } from "@/lib/cardano-assets";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import type { Asset } from "@/lib/types/contracts";
import { cn } from "@/lib/utils/cn";

const LOCKED_ASSETS_LIST_PREVIEW = 5;

type AssetKind = "ada" | "stable" | "nft" | "token";

function classifyAssetKind(
  asset: { unit: string; quantity: string },
  knownMeta: KnownAssetMeta | null
): AssetKind {
  if (asset.unit === "lovelace") return "ada";
  if (knownMeta?.accent === "stable") return "stable";
  if (asset.quantity === "1") return "nft";
  return "token";
}

function getAssetKindLabel(kind: AssetKind): string {
  if (kind === "ada") return "Native";
  if (kind === "stable") return "Stablecoin";
  if (kind === "nft") return "NFT";
  return "Token";
}

function getAssetIcon(kind: AssetKind): LucideIcon {
  if (kind === "ada") return Sparkles;
  if (kind === "stable") return Coins;
  if (kind === "nft") return Gem;
  return Coins;
}

function formatAssetQuantityDisplay(asset: { unit: string; quantity: string }): string {
  if (asset.unit === "lovelace") {
    return formatLovelaceAsAda(asset.quantity);
  }
  try {
    return new Intl.NumberFormat("en-US").format(BigInt(asset.quantity));
  } catch {
    return asset.quantity;
  }
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Compact inline trend line used in asset rows. Renders nothing if fewer than
 * 2 points so the row collapses cleanly back to its plain layout. Uses a soft
 * baseline + a single-color stroke so it reads as rhythm, not data.
 */
function MicroSparkline({
  values,
  width = 64,
  height = 18,
  ariaLabel
}: {
  values: number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 1.5;
  const innerH = height - pad * 2;
  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = pad + innerH - ((value - min) / range) * innerH;
    return [x, y] as const;
  });
  const linePath = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${(points[points.length - 1]?.[0] ?? 0).toFixed(2)} ${height} L 0 ${height} Z`;
  const last = points[points.length - 1] ?? [0, height / 2];
  const first = values[0] ?? 0;
  const lastValue = values[values.length - 1] ?? 0;
  const diff = lastValue - first;
  // Treat ~flat as flat so a single dust transaction does not paint the row red.
  const epsilon = Math.max(Math.abs(first), Math.abs(lastValue)) * 0.005;
  const trend: "up" | "down" | "flat" =
    diff > epsilon ? "up" : diff < -epsilon ? "down" : "flat";
  const stroke =
    trend === "up"
      ? "hsl(var(--brand-teal))"
      : trend === "down"
        ? "hsl(0 72% 65%)"
        : "hsl(var(--muted-foreground))";
  const fillOpacity = trend === "flat" ? 0.06 : 0.18;
  const gradientId = `spark-fill-${trend}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill={stroke} />
    </svg>
  );
}

export type LockedAssetsOverviewPanelProps = {
  utxoCount: number;
  assets: Asset[];
  paddingClassName?: string;
  className?: string;
  loadError?: string | null;
  loading?: boolean;
  emptyHint?: string;
  listPreviewLimit?: number;
  onAssetClick?: (unit: string) => void;
  /** Optional per-asset spark series. Returns null if no series available. */
  getSparkSeries?: (unit: string) => number[] | null;
  /** Optional CTA shown inside the empty state (e.g. "Receive funds"). */
  emptyCta?: { label: string; onClick: () => void } | null;
};

export function LockedAssetsOverviewPanel({
  utxoCount,
  assets,
  paddingClassName = "p-3",
  className,
  loadError = null,
  loading = false,
  emptyHint,
  listPreviewLimit = LOCKED_ASSETS_LIST_PREVIEW,
  onAssetClick,
  getSparkSeries,
  emptyCta
}: LockedAssetsOverviewPanelProps) {
  const [assetPageIndex, setAssetPageIndex] = useState(0);

  const sortedAssets = useMemo(
    () =>
      [...assets].sort((a, b) => {
        if (a.unit === "lovelace") return -1;
        if (b.unit === "lovelace") return 1;
        return a.unit.localeCompare(b.unit);
      }),
    [assets]
  );
  const assetPageSize = Math.max(1, listPreviewLimit);
  const assetPageCount = Math.max(1, Math.ceil(sortedAssets.length / assetPageSize));
  const normalizedAssetPageIndex = Math.min(assetPageIndex, assetPageCount - 1);
  const visibleAssets = sortedAssets.slice(
    normalizedAssetPageIndex * assetPageSize,
    normalizedAssetPageIndex * assetPageSize + assetPageSize
  );
  const visibleStart =
    sortedAssets.length === 0 ? 0 : normalizedAssetPageIndex * assetPageSize + 1;
  const visibleEnd = Math.min(
    sortedAssets.length,
    normalizedAssetPageIndex * assetPageSize + visibleAssets.length
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-background/40",
        paddingClassName,
        className
      )}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Coins className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Assets
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sortedAssets.length === 0
              ? "Nothing inside this wallet yet."
              : `${formatCountLabel(sortedAssets.length, "asset")} in this wallet.`}
          </p>
        </div>
        {utxoCount > 1 ? (
          <span
            className="self-start rounded-full border border-border/50 bg-background/60 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
            title="Funds inside this wallet are split into separate pools on chain."
          >
            {formatCountLabel(utxoCount, "fund pool")}
          </span>
        ) : null}
      </div>
      {loading && sortedAssets.length === 0 && !loadError ? (
        <div className="mt-3 space-y-2" aria-busy="true" aria-live="polite">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : null}
      {loadError ? (
        <p
          className="mt-3 rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}
      {sortedAssets.length === 0 && !loadError && !loading ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-dashed border-border/60 bg-gradient-to-br from-background/55 via-background/30 to-background/10 p-4">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 shrink-0">
              <span
                aria-hidden="true"
                className="absolute -inset-1 rounded-full bg-primary/20 blur-md animate-[pill-pulse_2400ms_cubic-bezier(0.22,1,0.36,1)_infinite]"
              />
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-background/70">
                <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                Wallet ready. Fund it to begin.
              </p>
              {emptyHint ? (
                <p className="text-xs leading-relaxed text-muted-foreground">{emptyHint}</p>
              ) : null}
              {emptyCta ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={emptyCta.onClick}
                  className="mt-1.5 h-7 px-2 text-xs"
                >
                  <Download className="h-3 w-3" />
                  {emptyCta.label}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {sortedAssets.length > 0 ? (
        <div className="mt-3">
          <ul
            className="space-y-1.5 overflow-y-auto pr-1"
            aria-label="Wallet assets"
          >
            {visibleAssets.map((asset, index) => {
              const identity = resolveAssetIdentity(asset.unit);
              const kind = classifyAssetKind(asset, identity.knownMeta);
              const Icon = getAssetIcon(kind);
              const kindLabel = getAssetKindLabel(kind);
              const qty = formatAssetQuantityDisplay(asset);
              const subtitle = identity.knownMeta?.name || kindLabel;
              const showSubtitle = kind !== "ada";
              const sparkValues = getSparkSeries?.(asset.unit) ?? null;
              const hasSpark = Array.isArray(sparkValues) && sparkValues.length >= 2;
              const rowContent = (
                <>
                  <AssetIcon kind={kind} unit={asset.unit} identity={identity} Icon={Icon} />
                  <div className="min-w-0 flex-1 text-left">
                    <p
                      className="truncate text-sm font-medium text-foreground"
                      title={identity.symbol}
                    >
                      {identity.symbol}
                    </p>
                    {showSubtitle ? (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                  {hasSpark && sparkValues ? (
                    <MicroSparkline
                      values={sparkValues}
                      ariaLabel={`${identity.symbol} recent balance trend`}
                    />
                  ) : null}
                  <p
                    className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground"
                    title={asset.quantity}
                  >
                    {qty}
                  </p>
                </>
              );
              return (
                <li
                  key={asset.unit}
                  className="list-stagger-item min-w-0"
                  style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
                >
                  {onAssetClick ? (
                    <button
                      type="button"
                      onClick={() => onAssetClick(asset.unit)}
                      title={asset.unit}
                      className="group flex w-full items-center gap-3 rounded-lg border border-border/50 bg-background/45 px-3 py-2 text-left transition-[background-color,border-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform hover:-translate-y-px hover:border-primary/40 hover:bg-background/65 hover:shadow-[0_8px_24px_-22px_hsl(var(--brand-teal)/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {rowContent}
                    </button>
                  ) : (
                    <div
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/45 px-3 py-2"
                      title={asset.unit}
                    >
                      {rowContent}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {sortedAssets.length > assetPageSize ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {visibleStart}-{visibleEnd} of {sortedAssets.length}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setAssetPageIndex(Math.max(normalizedAssetPageIndex - 1, 0))}
                  disabled={normalizedAssetPageIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setAssetPageIndex(Math.min(normalizedAssetPageIndex + 1, assetPageCount - 1))
                  }
                  disabled={normalizedAssetPageIndex >= assetPageCount - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
