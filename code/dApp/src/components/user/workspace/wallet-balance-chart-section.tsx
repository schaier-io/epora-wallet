"use client";
import { useAtomValue } from "jotai";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { WealthChart } from "@/components/user/wealth-chart";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { streamingPaymentUnit } from "@/lib/user-flow/guided-helpers";
import { cn } from "@/lib/utils/cn";
import {
  availableWealthSeriesForAssetAtom,
  wealthSeriesForAssetAtom
} from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import {
  activeInferredSttStateFormAtom,
  totalLockedContractAssetsAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";

/**
 * Line colors keyed to the asset's position in the pill row, so a charted asset keeps
 * its color as others are added and removed. The first is the brand teal; the rest are
 * plain hex, because a recharts stroke needs a value it can pass through as-is.
 */
const SERIES_COLORS = [
  "hsl(var(--brand-teal))",
  "#38bdf8",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#34d399"
];

/**
 * The Activity page's balance chart with the wallet's own assets bolted on: pills pick
 * which asset series to draw — several at once, each line named by the legend beneath —
 * and an "available only" switch subtracts what the wallet's streaming payments still
 * owe. Lives outside the config view so it can read atoms directly, like the dashboard
 * does.
 */
export function WalletBalanceChartSection() {
  const i18n = useTranslations("ComponentsUserWorkspaceWalletBalanceChartSection");
  const wealthSeriesForAsset = useAtomValue(wealthSeriesForAssetAtom);
  const availableWealthSeriesForAsset = useAtomValue(availableWealthSeriesForAssetAtom);
  const lockedAssets = useAtomValue(totalLockedContractAssetsAtom);
  const streamingPayments = useAtomValue(activeInferredSttStateFormAtom).streamingPayments;

  const [pickedUnits, setPickedUnits] = useState<string[]>(["lovelace"]);
  const [showAvailable, setShowAvailable] = useState(false);

  const adaSeries = wealthSeriesForAsset("lovelace");
  if (adaSeries.length === 0) return null;

  const tokenUnits = lockedAssets
    .filter((asset) => asset.unit !== "lovelace")
    .filter((asset) => {
      try {
        return BigInt(asset.quantity) > 0n;
      } catch {
        return false;
      }
    })
    .map((asset) => asset.unit);

  const pills: Array<{ unit: string; label: string }> = [
    { unit: "lovelace", label: i18n("ada") },
    ...tokenUnits.map((unit) => ({
      unit,
      label: resolveAssetIdentity(unit).symbol
    }))
  ];

  // A refresh can drop a token the user was charting: prune it from the selection
  // rather than draw an asset the wallet no longer holds. An empty selection (every
  // picked pill removed) falls back to ADA so the chart never draws nothing.
  const chartedUnits = pills
    .filter((pill) => pickedUnits.includes(pill.unit))
    .map((pill) => pill.unit);
  const drawnUnits = chartedUnits.length > 0 ? chartedUnits : ["lovelace"];

  const toggleUnit = (unit: string) => {
    setPickedUnits((current) => {
      const base = pills
        .filter((pill) => current.includes(pill.unit))
        .map((pill) => pill.unit);
      const effective = base.length > 0 ? base : ["lovelace"];
      if (effective.includes(unit)) {
        const next = effective.filter((picked) => picked !== unit);
        return next.length > 0 ? next : effective;
      }
      return [...effective, unit];
    });
  };

  // The switch only means something for assets a stream is paying out of; with none,
  // total and available are the same line, and the helper says so.
  const hasStreamsForSelection = streamingPayments.some((stream) =>
    drawnUnits.includes(streamingPaymentUnit(stream))
  );

  const seriesList = drawnUnits.map((unit) => {
    const isAda = unit === "lovelace";
    const identity = isAda ? null : resolveAssetIdentity(unit);
    const colorIndex = Math.max(
      0,
      pills.findIndex((pill) => pill.unit === unit)
    );
    return {
      id: unit,
      label: isAda ? i18n("ada") : (identity?.symbol ?? unit),
      color: SERIES_COLORS[colorIndex % SERIES_COLORS.length],
      series: showAvailable
        ? availableWealthSeriesForAsset(unit)
        : wealthSeriesForAsset(unit),
      formatValue: (value: number) =>
        value.toLocaleString(undefined, {
          minimumFractionDigits: isAda ? 2 : 0,
          maximumFractionDigits: isAda ? 2 : 6
        }),
      unitLabel: isAda ? "₳" : (identity?.symbol ?? unit)
    };
  });

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label={i18n("chartPickerLabel")}
        className="flex flex-wrap items-center gap-1"
      >
        {pills.map((pill) => {
          const active = drawnUnits.includes(pill.unit);
          return (
            <button
              key={pill.unit}
              type="button"
              onClick={() => toggleUnit(pill.unit)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
              )}
            >
              {pill.label}
            </button>
          );
        })}
      </div>
      <WealthChart
        seriesList={seriesList}
        unitLabel="₳"
        formatValue={seriesList[0]?.formatValue ?? ((value: number) => String(value))}
        title={i18n("walletBalance")}
        footer={
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 accent-[hsl(var(--brand-teal))]"
              checked={showAvailable}
              onChange={(event) => setShowAvailable(event.target.checked)}
            />
            <span>
              <span className="font-medium text-foreground">{i18n("availableOnly")}</span>
              {" — "}
              {i18n("availableOnlyHelper")}
              {hasStreamsForSelection
                ? null
                : i18n("value1", { value1: i18n("noStreamsPayingTheChartedAssets") })}
            </span>
          </label>
        }
      />
    </div>
  );
}
