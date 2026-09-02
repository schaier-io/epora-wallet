"use client";
import { useTranslations } from "next-intl";

import { type ReactNode, useId, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { cn } from "@/lib/utils/cn";

export type WealthSeriesPoint = {
  timestamp: number;
  value: number;
};

export type WealthChartRange = "7d" | "30d" | "90d" | "1y" | "all";

/**
 * One drawable line when the chart shows several assets at once. `id` is the recharts
 * data key; `color` must be a plain CSS color the SVG can use as a stroke.
 */
export type WealthChartSeries = {
  id: string;
  label: string;
  color: string;
  series: WealthSeriesPoint[];
  /** Per-series formatting, because assets disagree about precision (₳ vs tokens). */
  formatValue?: (value: number) => string;
  unitLabel?: string;
};

const RANGE_PILLS: Array<{ id: WealthChartRange; label: string; days: number | null }> = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "90d", label: "90D", days: 90 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "ALL", days: null }
];

const CHART_HEIGHT_CLASS = "h-[180px]";

type WealthChartProps = {
  series?: WealthSeriesPoint[];
  /** Several assets drawn together; wins over `series` when present. */
  seriesList?: WealthChartSeries[];
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
  /** Rendered under the chart, inside the card: series-wide controls (e.g. a
      "subtract scheduled payments" toggle) that shape the series itself. */
  footer?: ReactNode;
};

/**
 * `coversRange` is false when the fallback below fired, and the caller needs to know. Drawing
 * the last two points regardless is right, because a single dot is not a chart, but the range
 * pill then names a period the chart is not showing: pick 7D on a wallet whose two events are
 * six months apart and the delta was still labelled "over 7D", with the axis dates underneath
 * contradicting it.
 */
function filterByRange<T extends { timestamp: number }>(rows: T[], range: WealthChartRange) {
  if (rows.length === 0) return { points: rows, coversRange: true };
  const cutoff = (() => {
    const pill = RANGE_PILLS.find((p) => p.id === range);
    if (!pill || pill.days === null) return null;
    return Date.now() - pill.days * 24 * 60 * 60 * 1000;
  })();
  if (cutoff === null) return { points: rows, coversRange: true };
  const visible = rows.filter((p) => p.timestamp >= cutoff);
  if (visible.length >= 2) return { points: visible, coversRange: true };
  // Show at least the most recent two points so the range keeps its context. A lone
  // point still draws (as a dot); see the x-domain guard in the chart body.
  return {
    points: rows.slice(Math.max(0, rows.length - 2)),
    coversRange: false
  };
}

function formatTimestampShort(ms: number) {
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimestampLong(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function WealthChart({
  series,
  seriesList,
  unitLabel,
  formatValue,
  defaultRange = "30d",
  className,
  title,
  subtitle,
  footer
}: WealthChartProps) {
  const i18n = useTranslations("ComponentsUserWealthChart");
  const [range, setRange] = useState<WealthChartRange>(defaultRange);
  // Each series is range-filtered on its own before the merge. Filtering the merged
  // rows instead let a recent ADA line satisfy the range while an older token's
  // points were all cut: the token drew nothing, yet its legend row still showed.
  // The per-series fallback (keep the newest two points) keeps every picked asset
  // drawable, and `coversRange` is only true when every series really covers the
  // range it names.
  const multi = useMemo(() => {
    if (!seriesList || seriesList.length === 0) return null;
    const filtered = seriesList.map((entry) => {
      const rangeFilter = filterByRange(entry.series, range);
      return { entry, points: rangeFilter.points, coversRange: rangeFilter.coversRange };
    });
    const timestamps = new Set<number>();
    for (const { points } of filtered) {
      for (const point of points) timestamps.add(point.timestamp);
    }
    const rows = [...timestamps].sort((a, b) => a - b).map((timestamp) => {
      const row: { timestamp: number } & Record<string, number> = { timestamp };
      for (const { entry, points } of filtered) {
        const point = points.find((p) => p.timestamp === timestamp);
        if (point) row[entry.id] = point.value;
      }
      return row;
    });
    return {
      entries: seriesList,
      rows,
      coversRange: filtered.every(({ coversRange: covered }) => covered)
    };
  }, [seriesList, range]);

  const { points: visibleRows, coversRange } = useMemo(
    () =>
      multi
        ? { points: multi.rows as Array<{ timestamp: number }>, coversRange: multi.coversRange }
        : filterByRange<{ timestamp: number }>(series ?? [], range),
    [multi, series, range]
  );
  const visible = visibleRows;
  // The single-series branch works on the points as they came in; multi rows are
  // keyed by series id instead.
  const visiblePoints = visibleRows as WealthSeriesPoint[];
  const empty = visible.length === 0;
  const latestValue = visiblePoints[visiblePoints.length - 1]?.value ?? 0;
  const firstValue = visiblePoints[0]?.value ?? 0;
  const delta = latestValue - firstValue;
  const deltaPct = firstValue !== 0 ? (delta / firstValue) * 100 : 0;
  const deltaLabel =
    multi || visible.length < 2
      ? null
      : i18n("value1Value2Value3", { value1: delta >= 0 ? "+" : "−", value2: formatValue(Math.abs(delta)), value3: firstValue !== 0 ? ` (${delta >= 0 ? "+" : "−"}${Math.abs(deltaPct).toFixed(1)}%)` : "" });
  // One id per instance: two charts on the same screen would otherwise share a
  // gradient, and the second `defs` would win for both. `useId` rather than a
  // random value, because a random one is impure during render and would differ
  // between the server and the client pass.
  const gradientId = `wealth-chart-fill-${useId().replace(/:/g, "")}`;
  // A funded-and-untouched wallet is a flat line, and a flat series has no range
  // of its own: `dataMin`/`dataMax` collapse to a zero-height band and the area
  // fill disappears. The hand-rolled chart guarded this with
  // `yMax - yMin || Math.max(1, yMax * 0.05)`; this is the same guard.
  const yDomain = useMemo<[number, number]>(() => {
    const values = multi
      ? visible.flatMap((row) =>
          multi.entries
            .map((entry) => (row as Record<string, number | undefined>)[entry.id])
            .filter((value): value is number => value !== undefined)
        )
      : visiblePoints.map((point) => point.value);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max > min) return [min, max];
    const pad = Math.max(1, Math.abs(max) * 0.05);
    return [min - pad, max + pad];
  }, [visible, visiblePoints, multi]);
  // A one-point series (a funded-and-untouched wallet whose single event has no block
  // time, so the hold-to-now append in the atom has nothing to extend) collapses the
  // time scale to zero width and the dot would land on the axis edge. A symmetric
  // half-day of runway keeps the dot readable and the axis honest about "around now".
  const xDomain = useMemo<[number, number]>(() => {
    const timestamps = visible.map((point) => point.timestamp);
    if (timestamps.length === 0) return [0, 1];
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    if (max > min) return [min, max];
    const halfDay = 12 * 60 * 60 * 1000;
    return [min - halfDay, max + halfDay];
  }, [visible]);
  const dotProps =
    visible.length === 1
      ? // The dot's ring comes from the .wealth-chart CSS rules: a `stroke` here would
        // ride through as a presentation attribute, where var() does not resolve.
        { r: 3.5, strokeWidth: 2, fill: "hsl(var(--brand-teal))" }
      : false;
  const rangeLabel = coversRange
    ? i18n("value1Value2_79c718", { value1: i18n("over"), value2: RANGE_PILLS.find((p) => p.id === range)?.label ?? "" })
    : "";
  const chartLabel = multi
    ? i18n("value1Rangelabel", { value1: title ?? "Wealth chart", rangeLabel: rangeLabel })
    : title
      ? i18n("titleValue2UnitlabelValue4", { title: title, value2: formatValue(latestValue), unitLabel: unitLabel, value4: rangeLabel ? ` ${rangeLabel}` : "" })
      : i18n("wealthChartValue1Unitlabel", { value1: formatValue(latestValue), unitLabel: unitLabel });

  // Per-series latest value for the legend: the last point the visible range actually
  // shows, falling back to the series' own last point (a series can end outside the
  // range while another asset's events pulled the window forward).
  const legend = multi
    ? multi.entries.map((entry) => {
        const latest =
          [...entry.series].reverse().find((point) =>
            visible.some((row) => row.timestamp === point.timestamp)
          )?.value ?? entry.series[entry.series.length - 1]?.value ?? 0;
        const fmt = entry.formatValue ?? formatValue;
        return { entry, text: `${fmt(latest)}${entry.unitLabel ? ` ${entry.unitLabel}` : ""}` };
      })
    : null;

  return (
    <div className={cn("wealth-chart rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <p className="eyebrow text-muted-foreground">
              {title}
              {subtitle ? <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">{subtitle}</span> : null}
            </p>
          ) : null}
          {multi ? null : (
            <>
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
                  {coversRange ? (
                    <span className="ml-1 text-muted-foreground/80">
                      {i18n("over")} {RANGE_PILLS.find((p) => p.id === range)?.label}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </>
          )}
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
          <div
            className={cn(
              "flex items-center justify-center rounded-md border border-dashed border-border/60 bg-background/30 text-xs text-muted-foreground",
              CHART_HEIGHT_CLASS
            )}
          >
            {i18n("notEnoughActivityInThisRangeToDraw")}
          </div>
        ) : (
          // Recharts owns the drawing. The wrapper carries the single accessible
          // name, and its subtree is hidden so the chart's own nodes do not
          // announce a second, meaningless one.
          <div role="img" aria-label={chartLabel} className={cn("w-full", CHART_HEIGHT_CLASS)}>
            <div aria-hidden="true" className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visible} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    {multi ? (
                      multi.entries.map((entry, index) => (
                        <linearGradient id={`${gradientId}-${index}`} key={entry.id} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={entry.color} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0} />
                        </linearGradient>
                      ))
                    ) : (
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--brand-teal))" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="hsl(var(--brand-teal))" stopOpacity={0} />
                      </linearGradient>
                    )}
                  </defs>
                  {/* Grid/tick/cursor colors come from the .wealth-chart CSS rules; a
                      color passed here would land as a presentation attribute, where
                      var() does not resolve and the value degrades to black. */}
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    strokeOpacity={0.35}
                  />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={xDomain}
                    tickFormatter={formatTimestampShort}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    dataKey="value"
                    domain={yDomain}
                    width={44}
                    tickCount={3}
                    tickFormatter={multi ? (multi.entries[0]?.formatValue ?? formatValue) : formatValue}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    isAnimationActive={false}
                    cursor={{ strokeDasharray: "3 3" }}
                    labelFormatter={(value) => formatTimestampLong(Number(value))}
                    separator=""
                    formatter={(value, name) => {
                      if (multi) {
                        const entry = multi.entries.find((candidate) => candidate.id === name);
                        const fmt = entry?.formatValue ?? formatValue;
                        return [`${fmt(Number(value ?? 0))}${entry?.unitLabel ? ` ${entry.unitLabel}` : ""}`, entry?.label ?? String(name)];
                      }
                      return [`${formatValue(Number(value ?? 0))} ${unitLabel}`, ""];
                    }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  {multi ? (
                    multi.entries.map((entry, index) => (
                      <Area
                        key={entry.id}
                        type="monotone"
                        dataKey={entry.id}
                        connectNulls
                        stroke={entry.color}
                        strokeWidth={1.75}
                        fill={`url(#${gradientId}-${index})`}
                        dot={visible.length === 1 ? dotProps : false}
                        activeDot={{ r: 3.5, strokeWidth: 2 }}
                      />
                    ))
                  ) : (
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--brand-teal))"
                      strokeWidth={1.75}
                      fill={`url(#${gradientId})`}
                      dot={dotProps}
                      activeDot={{ r: 3.5, strokeWidth: 2 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
      {legend ? (
        // The legend names what is drawn — which asset each line is and where it
        // stands now — because a multi-asset chart has no single headline number.
        <div className="mt-3 space-y-1 border-t border-border/40 pt-2">
          {legend.map(({ entry, text }) => (
            <div key={entry.id} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              <span className="min-w-0 truncate font-medium text-foreground">{entry.label}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{text}</span>
            </div>
          ))}
        </div>
      ) : null}
      {footer ? (
        <div className="mt-3 border-t border-border/40 pt-3">{footer}</div>
      ) : null}
    </div>
  );
}
