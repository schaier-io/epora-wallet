"use client";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

// Sliders for the approval-power numbers. They replace free-number boxes: a
// slider cannot hold "1.5" or an empty string, so the whole "must be an
// integer" error class disappears at the source, and the track carries the
// reachability colour the threshold needs — green when the co-signers can
// actually meet the number, red when nobody can.
//
// With `markAt` (the rule's threshold) the track permanently shows where a
// person alone reaches the rule: neutral below the threshold — power that
// only counts added up with others — emerald from the threshold up. The
// thumb and the value chip turn emerald once the chosen value is there, so
// "full approval" is a place on the track, not a number to remember.
export function IntegerPowerSlider({
  label,
  value,
  onChange,
  max,
  tone = "neutral",
  helper,
  markAt
}: {
  label: string;
  /** The raw form string. Non-numeric or empty falls back to the slider's minimum. */
  value: string;
  onChange: (next: string) => void;
  /** Slider upper bound. The current value always stays reachable, even past max. */
  max: number;
  tone?: "neutral" | "met" | "unreachable";
  helper?: string;
  /** The threshold at which this person alone meets the approval rule. */
  markAt?: number;
}) {
  const uid = useId();
  const parsed = Number.parseInt(value, 10);
  const current = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  const upper = Math.max(max, current, 1);
  const accent =
    tone === "met"
      ? "accent-emerald-500"
      : tone === "unreachable"
        ? "accent-rose-500"
        : "accent-primary";
  const chip =
    tone === "met"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "unreachable"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
        : "border-border/60 bg-background/60 text-foreground";

  const hasMark = markAt != null && markAt > 1;
  const reachesAlone = hasMark && current >= markAt;
  // The zone starts at `markAt` on the 1..upper scale; a person holding exactly
  // the threshold already passes alone.
  const reachesPct = hasMark
    ? Math.min(100, Math.max(0, ((markAt - 1) / (upper - 1)) * 100))
    : 0;
  const chipClass = reachesAlone
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : chip;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={uid}>{label}</Label>
        <span
          aria-hidden="true"
          className={cn("min-w-9 rounded-full border px-2 py-0.5 text-center text-xs font-semibold", chipClass)}
        >
          {current}
        </span>
      </div>
      {hasMark ? (
        <div className="relative h-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted"
          >
            <div
              data-threshold-zone="reached"
              className="absolute inset-y-0 right-0 bg-emerald-500/50"
              style={{ left: `${reachesPct}%` }}
            />
          </div>
          <input
            id={uid}
            type="range"
            min={1}
            max={upper}
            step={1}
            value={current}
            onChange={(event) => onChange(event.target.value)}
            className={cn("user-power-slider relative z-10 w-full cursor-pointer", reachesAlone && "user-power-reaches")}
          />
        </div>
      ) : (
        <input
          id={uid}
          type="range"
          min={1}
          max={upper}
          step={1}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          className={cn("w-full cursor-pointer", accent)}
        />
      )}
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
