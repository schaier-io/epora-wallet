"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils/cn";

export type WealthSeriesPoint = {
  timestamp: number;
  value: number;
};

export type WealthChartRange = "7d" | "30d" | "90d" | "1y" | "all";

const RANGE_PILLS: Array<{ id: WealthChartRange; label: string; days: number | null }> = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "90d", label: "90D", days: 90 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "ALL", days: null }
];

const CHART_WIDTH = 800;
const CHART_HEIGHT = 220;
const CHART_PAD = { top: 12, right: 12, bottom: 22, left: 12 };

type WealthChartProps = {
  series: WealthSeriesPoint[];
  /** Plain-language label for the value axis, e.g. "ADA" or "USDM". */
  unitLabel: string;
  /** Formatter for value tooltips. */
  formatValue: (value: number) => string;
  defaultRange?: WealthChartRange;
  className?: string;
  /** Shown above the chart, top-left. Usually the asset or wallet name. */
  title?: string;
  /** Optional small label rendered to the right of the title. */
  subtitle?: string;
};

function filterByRange(series: WealthSeriesPoint[], range: WealthChartRange) {
  if (series.length === 0) return series;
  const cutoff = (() => {
    const pill = RANGE_PILLS.find((p) => p.id === range);
    if (!pill || pill.days === null) return null;
    return Date.now() - pill.days * 24 * 60 * 60 * 1000;
  })();
  if (cutoff === null) return series;
  const visible = series.filter((p) => p.timestamp >= cutoff);
  if (visible.length >= 2) return visible;
  // Always show at least the most recent two points so the chart isn't a single dot.
  return series.slice(Math.max(0, series.length - 2));
}

function buildPath(
  series: WealthSeriesPoint[],
  width: number,
  height: number,
  pad: typeof CHART_PAD
) {
  if (series.length === 0) return { area: "", line: "", anchor: { x: 0, y: 0 } };
  const xs = series.map((p) => p.timestamp);
  const ys = series.map((p) => p.value);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || Math.max(1, yMax * 0.05);
  const project = (p: WealthSeriesPoint) => ({
    x: pad.left + ((p.timestamp - xMin) / xRange) * innerW,
    y: pad.top + innerH - ((p.value - yMin) / yRange) * innerH
  });
  const projected = series.map(project);
  const line = projected.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const baseY = pad.top + innerH;
  const first = projected[0];
  const last = projected[projected.length - 1];
  const area = `${line} L${last.x.toFixed(2)} ${baseY.toFixed(2)} L${first.x.toFixed(2)} ${baseY.toFixed(2)} Z`;
  return { area, line, anchor: last };
}

function formatTimestampShort(ms: number) {
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WealthChart({
  series,
  unitLabel,
  formatValue,
  defaultRange = "30d",
  className,
  title,
  subtitle
}: WealthChartProps) {
  const [range, setRange] = useState<WealthChartRange>(defaultRange);
  const visible = useMemo(() => filterByRange(series, range), [series, range]);
  const path = useMemo(() => buildPath(visible, CHART_WIDTH, CHART_HEIGHT, CHART_PAD), [visible]);
  const empty = visible.length < 2;
  const latestValue = visible[visible.length - 1]?.value ?? 0;
  const firstValue = visible[0]?.value ?? 0;
  const delta = latestValue - firstValue;
  const deltaPct = firstValue !== 0 ? (delta / firstValue) * 100 : 0;
  const deltaLabel =
    visible.length < 2
      ? null
      : `${delta >= 0 ? "+" : "−"}${formatValue(Math.abs(delta))}${
          firstValue !== 0 ? ` (${delta >= 0 ? "+" : "−"}${Math.abs(deltaPct).toFixed(1)}%)` : ""
        }`;

  return (
    <div className={cn("rounded-lg border border-border/60 bg-background/40 p-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {title}
              {subtitle ? <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">{subtitle}</span> : null}
            </p>
          ) : null}
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatValue(latestValue)}
            <span className="ml-1.5 text-sm font-medium text-muted-foreground">{unitLabel}</span>
          </p>
          {deltaLabel ? (
            <p
              className={cn(
                "mt-0.5 text-xs tabular-nums",
                delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-muted-foreground"
              )}
            >
              {deltaLabel}
              <span className="ml-1 text-muted-foreground/80">over {RANGE_PILLS.find((p) => p.id === range)?.label}</span>
            </p>
          ) : null}
        </div>
        <div className="relative flex items-center gap-1 self-start rounded-full border border-border/60 bg-background/50 p-0.5">
          {RANGE_PILLS.map((pill) => {
            const active = pill.id === range;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setRange(pill.id)}
                className={cn(
                  "relative isolate rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={active}
              >
                {active ? (
                  <motion.span
                    layoutId="wealth-chart-range-indicator"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-full bg-primary/15"
                    transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.6 }}
                  />
                ) : null}
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3">
        {empty ? (
          <div className="flex h-[var(--wealth-chart-empty-h,160px)] items-center justify-center rounded-md border border-dashed border-border/60 bg-background/30 text-xs text-muted-foreground">
            Not enough activity in this range to draw a chart yet.
          </div>
        ) : (
          <svg
            key={`${range}-${visible.length}`}
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-[180px] w-full"
            role="img"
            aria-label={
              title
                ? `${title} ${formatValue(latestValue)} ${unitLabel} over ${RANGE_PILLS.find((p) => p.id === range)?.label}`
                : `Wealth chart ${formatValue(latestValue)} ${unitLabel}`
            }
          >
            <defs>
              <linearGradient id="wealthChartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--brand-teal))" stopOpacity="0.25" />
                <stop offset="100%" stopColor="hsl(var(--brand-teal))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={path.area} fill="url(#wealthChartFill)" className="wealth-chart-area" />
            <path
              d={path.line}
              pathLength={1}
              fill="none"
              stroke="hsl(var(--brand-teal))"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="wealth-chart-line"
            />
            <circle
              cx={path.anchor.x}
              cy={path.anchor.y}
              r="3.5"
              fill="hsl(var(--brand-teal))"
              stroke="hsl(var(--background))"
              strokeWidth="2"
              className="wealth-chart-anchor"
            />
          </svg>
        )}
        {!empty && visible.length > 0 ? (
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70">
            <span>{formatTimestampShort(visible[0].timestamp)}</span>
            <span>{formatTimestampShort(visible[visible.length - 1].timestamp)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
