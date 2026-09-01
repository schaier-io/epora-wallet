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
 * The Activity page's balance chart with the wallet's own assets bolted on: a pill row
 * picks which asset's series to draw (ADA first, then every token the wallet holds), and
 * an "available only" switch subtracts what the wallet's streaming payments still owe.
 * Lives outside the config view so it can read atoms directly, like the dashboard does.
 */
export function WalletBalanceChartSection() {
  const i18n = useTranslations("ComponentsUserWorkspaceWalletBalanceChartSection");
  const wealthSeriesForAsset = useAtomValue(wealthSeriesForAssetAtom);
  const availableWealthSeriesForAsset = useAtomValue(availableWealthSeriesForAssetAtom);
  const lockedAssets = useAtomValue(totalLockedContractAssetsAtom);
  const streamingPayments = useAtomValue(activeInferredSttStateFormAtom).streamingPayments;

  const [selectedUnit, setSelectedUnit] = useState("lovelace");
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

  const isAda = selectedUnit === "lovelace";
  const identity = isAda ? null : resolveAssetIdentity(selectedUnit);
  const unitLabel = isAda ? "₳" : (identity?.symbol ?? selectedUnit);
  // The switch only renders when the charted asset actually has streams: a checkbox
  // that could be ticked without changing the line would read as broken.
  const hasStreamsForSelection = streamingPayments.some(
    (stream) => streamingPaymentUnit(stream) === selectedUnit
  );
  const series = showAvailable
    ? availableWealthSeriesForAsset(selectedUnit)
    : wealthSeriesForAsset(selectedUnit);

  const formatValue = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: isAda ? 2 : 0,
      maximumFractionDigits: isAda ? 2 : 6
    });

  const pills: Array<{ unit: string; label: string }> = [
    { unit: "lovelace", label: i18n("ada") },
    ...tokenUnits.map((unit) => ({
      unit,
      label: resolveAssetIdentity(unit).symbol
    }))
  ];

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label={i18n("chartPickerLabel")}
        className="flex flex-wrap items-center gap-1"
      >
        {pills.map((pill) => {
          const active = pill.unit === selectedUnit;
          return (
            <button
              key={pill.unit}
              type="button"
              onClick={() => setSelectedUnit(pill.unit)}
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
        series={series}
        unitLabel={unitLabel}
        formatValue={formatValue}
        title={
          isAda
            ? i18n("walletBalance")
            : i18n("value1Balance", { value1: unitLabel })
        }
        footer={
          hasStreamsForSelection ? (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 accent-[hsl(var(--brand-teal))]"
                checked={showAvailable}
                onChange={(event) => setShowAvailable(event.target.checked)}
              />
              <span>
                <span className="font-medium text-foreground">{i18n("availableOnly")}</span>{" "}
                — {i18n("availableOnlyHelper")}
              </span>
            </label>
          ) : null
        }
      />
    </div>
  );
}
