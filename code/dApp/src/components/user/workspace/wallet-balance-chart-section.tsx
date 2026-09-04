"use client";
import { useAtomValue } from "jotai";
import { useFormatter, useTranslations } from "next-intl";
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
 * Color by stable asset identity, not the asset's position in the pill row: when an
 * earlier token is sold, a position-indexed palette would recolor every token after
 * it. ADA is pinned to the brand teal; tokens hash into the rest of the palette.
 */
function colorForUnit(unit: string) {
  if (unit === "lovelace") {
    return SERIES_COLORS[0];
  }

  let hash = 0;
  for (const character of unit) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  return SERIES_COLORS[1 + (hash % (SERIES_COLORS.length - 1))];
}

/**
 * The Activity page's balance chart with the wallet's own assets bolted on: pills pick
 * which asset series to draw — several at once, each line named by the legend beneath —
 * and an "available only" switch subtracts what the wallet's streaming payments still
 * owe. Lives outside the config view so it can read atoms directly, like the dashboard
 * does.
 */
export function WalletBalanceChartSection() {
  const i18n = useTranslations("ComponentsUserWorkspaceWalletBalanceChartSection");
  const format = useFormatter();
  const wealthSeriesForAsset = useAtomValue(wealthSeriesForAssetAtom);
  const availableWealthSeriesForAsset = useAtomValue(availableWealthSeriesForAssetAtom);
  const lockedAssets = useAtomValue(totalLockedContractAssetsAtom);
  const streamingPayments = useAtomValue(activeInferredSttStateFormAtom).streamingPayments;

  // The pick set carries the key of the held units it was last pruned against: a
  // refresh that drops a token prunes it from the picks (not just the drawing), so a
  // re-acquired token comes back as an unpicked pill instead of silently re-earning
  // its line. An empty pick set falls back to ADA so the chart never draws nothing.
  const [pickState, setPickState] = useState<{ availableKey: string; units: string[] }>({
    availableKey: "",
    units: ["lovelace"]
  });
  const [showAvailable, setShowAvailable] = useState(false);

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
  const availableUnitsKey = pills.map((pill) => pill.unit).join(",");

  // React's "adjust state when a prop changes" pattern: prune during render, guarded
  // by the key, so no effect cascade is needed.
  if (pickState.availableKey !== availableUnitsKey) {
    const available = availableUnitsKey ? availableUnitsKey.split(",") : [];
    const pruned = pickState.units.filter((unit) => available.includes(unit));
    setPickState({
      availableKey: availableUnitsKey,
      units: pruned.length > 0 ? pruned : ["lovelace"]
    });
  }
  const pickedUnits =
    pickState.units.filter((unit) => availableUnitsKey.split(",").includes(unit));

  const adaSeries = wealthSeriesForAsset("lovelace");
  if (adaSeries.length === 0) return null;

  // Render-time guard for the pass before the adjustment above settles.
  const chartedUnits = pills
    .filter((pill) => pickedUnits.includes(pill.unit))
    .map((pill) => pill.unit);
  const drawnUnits = chartedUnits.length > 0 ? chartedUnits : ["lovelace"];

  const toggleUnit = (unit: string) => {
    setPickState((current) => {
      const base = pills
        .filter((pill) => current.units.includes(pill.unit))
        .map((pill) => pill.unit);
      const effective = base.length > 0 ? base : ["lovelace"];
      let nextUnits: string[];
      if (effective.includes(unit)) {
        const next = effective.filter((picked) => picked !== unit);
        nextUnits = next.length > 0 ? next : effective;
      } else {
        nextUnits = [...effective, unit];
      }
      return { availableKey: availableUnitsKey, units: nextUnits };
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
    return {
      id: unit,
      label: isAda ? i18n("ada") : (identity?.symbol ?? unit),
      color: colorForUnit(unit),
      series: showAvailable
        ? availableWealthSeriesForAsset(unit)
        : wealthSeriesForAsset(unit),
      formatValue: (value: number) =>
        format.number(value, {
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
