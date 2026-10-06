"use client";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils/cn";

export type ApprovalPowerBarSegment = {
  key: string;
  label: string;
  power: number;
  /** Set on one person's own bar: their segment stays bright, the others dim. */
  highlighted?: boolean;
};

/**
 * The co-signers as one bar: a segment per person, as wide as their approval power,
 * and a marker at the threshold. A threshold above the power they hold together adds
 * a dashed red stretch past the last segment, which is the part nobody can cover.
 *
 * The bar is a picture of numbers the surrounding text already states, so it is one
 * `img` with a summary label rather than a row of focusable parts. Segments, marker
 * and labels share one easing, so a change moves all three together.
 */
export function ApprovalPowerBar({
  segments,
  threshold,
  compact = false,
  className
}: {
  segments: ApprovalPowerBarSegment[];
  threshold: number | null;
  /** A thin bar with no labels, for a summary line. */
  compact?: boolean;
  className?: string;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsApprovalPowerBar");
  const total = segments.reduce((sum, segment) => sum + segment.power, 0);
  const scale = Math.max(total, threshold ?? 0);
  if (scale <= 0) {
    return null;
  }
  const shortfall = threshold !== null && threshold > total ? threshold - total : 0;
  const markerAt = threshold === null ? null : (threshold / scale) * 100;
  const anyHighlighted = segments.some((segment) => segment.highlighted);

  return (
    <div
      role="img"
      aria-label={
        threshold === null
          ? i18n("totalApprovalPower", { total })
          : i18n("neededOfTotal", { needed: threshold, total })
      }
      className={cn("space-y-1.5", className)}
    >
      <div className={cn("relative", markerAt !== null && !compact && "pt-5")}>
        <div className={cn("flex gap-[3px]", compact ? "h-1.5" : "h-3")}>
          {segments.map((segment) => (
            <div
              key={segment.key}
              className={cn(
                "min-w-1 basis-0 rounded-[3px] transition-[flex-grow,background-color]",
                "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                anyHighlighted && !segment.highlighted
                  ? "bg-muted-foreground/30"
                  : "bg-[hsl(var(--brand-teal))]"
              )}
              style={{ flexGrow: segment.power }}
            />
          ))}
          {shortfall > 0 ? (
            <div
              className={cn(
                "min-w-1 basis-0 rounded-[3px] border border-dashed border-[hsl(0_84%_60%)] bg-[hsl(0_84%_60%/0.12)] transition-[flex-grow]",
                "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              )}
              style={{ flexGrow: shortfall }}
            />
          ) : null}
        </div>
        {markerAt !== null ? (
          <>
            <span
              className={cn(
                "absolute bottom-[-4px] w-0.5 -translate-x-1/2 rounded-full bg-foreground transition-[left]",
                compact ? "top-[-4px]" : "top-4",
                "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              )}
              style={{ left: `${markerAt}%` }}
            />
            {compact ? null : <span
              className={cn(
                "absolute top-0 whitespace-nowrap text-[11px] leading-4 text-foreground transition-[left]",
                "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                // Kept inside the bar at either end instead of spilling past its edge.
                markerAt > 85 ? "-translate-x-full" : markerAt < 15 ? "" : "-translate-x-1/2"
              )}
              style={{ left: `${markerAt}%` }}
            >
              {i18n("neededValue", { needed: threshold ?? 0 })}
            </span>}
          </>
        ) : null}
      </div>
      {compact ? null : <div className="flex gap-[3px] text-[11px] leading-4 text-muted-foreground">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={cn("min-w-0 basis-0 truncate transition-[flex-grow]", "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none")}
            style={{ flexGrow: segment.power }}
          >
            {i18n("labelPower", { label: segment.label, power: segment.power })}
          </span>
        ))}
        {shortfall > 0 ? (
          <span
            className={cn("min-w-0 basis-0 truncate text-[hsl(0_84%_60%)] transition-[flex-grow]", "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none")}
            style={{ flexGrow: shortfall }}
          >
            {i18n("missingPower", { missing: shortfall })}
          </span>
        ) : null}
      </div>}
    </div>
  );
}
