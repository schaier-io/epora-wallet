"use client";

import { useState } from "react";

import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

/**
 * The slider behind every approval-power field: the wallet threshold and each
 * person's own power.
 *
 * These were bare text boxes. A box gives no sense of the range the number
 * lives in, and approval power is only meaningful against the power the wallet
 * can reach, so the caller supplies `min`/`max` and the scale underneath names
 * the ends. The slider is the only control: there is no second box holding the
 * same number.
 *
 * `fullAt` is the stop where the number is the whole thing there is: for a
 * threshold, where it takes every co-signer (2 on a wallet whose two co-signers
 * hold 1 each); for one person's power, where that person meets the threshold
 * alone. The track is shaded from half a step before it to the end, so the
 * shading stays visible when the thumb is one stop short, and the thumb lands
 * inside it on the next step. Once inside, the fill and the thumb turn the same
 * colour, so the state reads from the bar rather than from the number.
 */
export function ApprovalPowerSlider({
  id,
  labelledBy,
  value,
  onChange,
  min,
  max,
  fullAt,
  fullAtHint,
  disabled,
  invalid,
  describedBy,
  className
}: {
  id: string;
  labelledBy: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  /** The stop where this number is the whole thing there is. */
  fullAt?: number;
  /** What reaching `fullAt` means, shown on hover and focus of that stop. */
  fullAtHint?: string;
  disabled?: boolean;
  /** The number is settable but does not work, e.g. a threshold nobody can reach. */
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const parsed = Number.parseInt(value, 10);
  // The caller's ceiling ignores the number this slider writes, so it cannot
  // shrink mid-drag. A number stored above it still has to be representable, so
  // the range is widened once, from the value this slider was first handed, and
  // never afterwards.
  const [storedTop] = useState(() => (Number.isFinite(parsed) ? parsed : min));
  const top = Math.max(max, storedTop);
  const current = Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), top) : min;
  const span = top - min;
  const marksFull = fullAt !== undefined && fullAt > min && fullAt <= top;
  const ticks =
    span > 0 && span <= 10
      ? Array.from({ length: span + 1 }, (_, index) => min + index)
      : // The scale collapses to its ends on a long range, but never past the
        // stop the shading marks: that band is the one thing on the track that
        // needs a name.
        [...new Set(marksFull ? [min, fullAt, top] : [min, top])].toSorted((a, b) => a - b);
  const fractionOf = (point: number) => (span > 0 ? (point - min) / span : 0);
  const atFull = marksFull && current >= fullAt;

  // A slider with a single reachable stop is a decoration, not a control: with
  // no co-signers yet, `max` collapses onto `min`.
  if (span <= 0) {
    return (
      <p
        id={id}
        aria-labelledby={labelledBy}
        className={cn("text-base font-semibold tabular-nums text-foreground", className)}
      >
        {current}
      </p>
    );
  }

  const tone = invalid ? "invalid" : atFull ? "full" : "normal";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-background/40 px-3 pb-2 pt-1",
        disabled && "opacity-60",
        className
      )}
    >
      {/* The readout rides above the thumb, so the live number needs no second
          control beside the track. Both this and the scale below sit inside the
          same half-thumb inset the thumb centre travels in. */}
      <div className="relative mx-2.5 h-6">
        <span
          style={{ left: `${fractionOf(current) * 100}%` }}
          className={cn(
            "absolute top-0 -translate-x-1/2 text-base font-semibold leading-6 tabular-nums",
            "transition-[left,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
            tone === "invalid" && "text-[hsl(0_84%_60%)]",
            tone === "full" && "text-[hsl(var(--brand-warm))]",
            tone === "normal" && "text-foreground"
          )}
        >
          {current}
        </span>
      </div>
      <Slider
        id={id}
        min={min}
        max={top}
        step={1}
        value={[current]}
        disabled={disabled}
        onValueChange={([next]) => onChange(String(next ?? min))}
        // Radix stays quiet when a gesture lands on the stop the thumb is
        // already on, and a blank stored value shows as `min` without being one.
        // Committing writes the displayed number, so clicking it stores it.
        onValueCommit={([next]) => onChange(String(next ?? min))}
        zoneFraction={marksFull ? fractionOf(fullAt - 0.5) : undefined}
        // A full teal bar reads as "all set" even when the number on it cannot
        // work, so the fill turns red instead of leaving the warning to the
        // sentence underneath. Inside the shaded stretch it takes that colour.
        rangeClassName={cn(
          tone === "invalid" &&
            "bg-[linear-gradient(90deg,hsl(20_90%_58%),hsl(0_84%_60%))]",
          tone === "full" &&
            "bg-[linear-gradient(90deg,hsl(var(--brand-teal)),hsl(var(--brand-warm)))]"
        )}
        thumbProps={{
          "aria-labelledby": labelledBy,
          "aria-describedby": describedBy,
          "aria-invalid": invalid ? true : undefined,
          "aria-disabled": disabled ? true : undefined,
          className: cn(
            tone === "invalid" &&
              "border-[hsl(0_84%_60%)] shadow-[0_2px_10px_-2px_hsl(0_84%_60%/0.7)]",
            tone === "full" &&
              "border-[hsl(var(--brand-warm))] shadow-[0_2px_10px_-2px_hsl(var(--brand-warm)/0.7)]"
          )
        }}
      />
      <div className="relative mx-2.5 mt-1.5 h-4 text-[11px] leading-none text-muted-foreground tabular-nums">
        {ticks.map((tick) => {
          const isFull = marksFull && tick === fullAt;
          const label = (
            <span
              style={{ left: `${fractionOf(tick) * 100}%` }}
              className={cn(
                "absolute top-0 -translate-x-1/2 leading-4",
                isFull && "font-semibold text-[hsl(var(--brand-warm))]"
              )}
            >
              {tick}
            </span>
          );

          if (!isFull || !fullAtHint) {
            return <span key={tick}>{label}</span>;
          }

          return (
            <Tooltip key={tick} content={fullAtHint}>
              <button
                type="button"
                style={{ left: `${fractionOf(tick) * 100}%` }}
                disabled={disabled}
                onClick={() => onChange(String(fullAt))}
                className={cn(
                  "absolute top-0 -translate-x-1/2 rounded px-1 leading-4",
                  "font-semibold text-[hsl(var(--brand-warm))] underline decoration-dotted underline-offset-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed"
                )}
              >
                {tick}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
