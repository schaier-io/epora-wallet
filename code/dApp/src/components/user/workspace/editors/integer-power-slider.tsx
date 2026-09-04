"use client";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

// Sliders for the approval-power numbers. They replace free-number boxes: a
// slider cannot hold "1.5" or an empty string, so the whole "must be an
// integer" error class disappears at the source.
//
// One custom track for every variant. The value bubble rides the thumb, ticks
// mark the whole-number stops, and the fill carries the meaning. With `markAt`
// (the rule's threshold) the track permanently shows where the person alone
// reaches the rule: neutral below the threshold — power that only counts added
// up with others — emerald from it up, thumb and bubble glowing once the
// chosen value is there. Without a threshold the fill takes the tone colour:
// emerald while the co-signers can meet the number, rose once nobody can.

// One tick per whole number is the point of this control, but `upper` follows the
// stored value, and an approval threshold or power read from wallet state is an
// unbounded integer. Past roughly two dozen stops the ticks are already narrower
// than the gap between them, and a stored `1000000` would render a million spans
// and freeze the settings view. Above the cap the ticks say nothing, so they are
// dropped; the range input still covers the whole scale.
const MAX_RENDERED_TICKS = 24;

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
  // Percent of a step on the 1..upper scale. The visual track is inset by the
  // thumb's radius (the overlays live in an inset-x-2 box), so a percent here
  // lands exactly under the thumb's centre at that step.
  const at = (step: number) => (upper > 1 ? ((step - 1) / (upper - 1)) * 100 : 0);
  const thumbPct = at(current);

  const ticks =
    upper <= MAX_RENDERED_TICKS ? Array.from({ length: upper }, (_, index) => index + 1) : [];

  const hasMark = markAt != null && markAt > 1;
  const reachesAlone = hasMark && current >= markAt;

  const fillClass = reachesAlone
    ? "bg-emerald-400/50"
    : tone === "met"
      ? "bg-emerald-500/50"
      : tone === "unreachable"
        ? "bg-rose-500/50"
        : "bg-primary/45";
  const bubbleClass =
    reachesAlone || tone === "met"
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
      : tone === "unreachable"
        ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
        : "border-border bg-background text-foreground shadow-md";
  const thumbToneClass =
    tone === "met"
      ? "user-power-met"
      : tone === "unreachable"
        ? "user-power-unreachable"
        : undefined;

  return (
    <div className="space-y-1">
      <Label htmlFor={uid}>{label}</Label>
      <div className="relative h-10 select-none">
        {/*
         * The value bubble rides the thumb: the number lives at the handle, where
         * the eye already is, instead of filed away at the end of the label row.
         */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-0 h-4">
          <div
            data-value-bubble=""
            className={cn(
              "absolute top-0 -translate-x-1/2 rounded-md border px-1.5 text-center text-[11px] font-bold leading-4 tabular-nums",
              bubbleClass
            )}
            style={{ left: `${thumbPct}%` }}
          >
            {current}
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 bottom-1 top-5">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]" />
          <div
            className={cn("absolute inset-y-0 left-0 rounded-l-full", fillClass)}
            style={{ width: `${thumbPct}%` }}
          />
          {hasMark ? (
            <div
              data-threshold-zone="reached"
              className="absolute inset-y-0 right-0 rounded-r-full bg-gradient-to-r from-emerald-500/40 to-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
              style={{ left: `${Math.min(100, Math.max(0, at(markAt)))}%` }}
            />
          ) : null}
          {ticks.map((step) => (
            <span
              key={step}
              data-tick={step}
              className={cn(
                "absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1",
                hasMark && markAt != null && step >= markAt
                  ? "bg-emerald-200/70 ring-emerald-900/40"
                  : "bg-background/80 ring-foreground/25"
              )}
              style={{ left: `${at(step)}%` }}
            />
          ))}
        </div>
        <input
          id={uid}
          type="range"
          min={1}
          max={upper}
          step={1}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "user-power-slider absolute inset-x-0 bottom-0 top-4 z-10 w-full cursor-pointer",
            reachesAlone && "user-power-reaches",
            thumbToneClass
          )}
        />
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
