"use client";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

// Sliders for the approval-power numbers. They replace free-number boxes: a
// slider cannot hold "1.5" or an empty string, so the whole "must be an
// integer" error class disappears at the source, and the track carries the
// reachability colour the threshold needs — green when the co-signers can
// actually meet the number, red when nobody can.
export function IntegerPowerSlider({
  label,
  value,
  onChange,
  max,
  tone = "neutral",
  helper
}: {
  label: string;
  /** The raw form string. Non-numeric or empty falls back to the slider's minimum. */
  value: string;
  onChange: (next: string) => void;
  /** Slider upper bound. The current value always stays reachable, even past max. */
  max: number;
  tone?: "neutral" | "met" | "unreachable";
  helper?: string;
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

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={uid}>{label}</Label>
        <span
          aria-hidden="true"
          className={cn("min-w-9 rounded-full border px-2 py-0.5 text-center text-xs font-semibold", chip)}
        >
          {current}
        </span>
      </div>
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
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
