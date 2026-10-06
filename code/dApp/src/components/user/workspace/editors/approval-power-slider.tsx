"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { isNonNegativeUint64Decimal } from "@/lib/contracts/on-chain-integer";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

// One block per whole number is the point of the meter, but the range follows
// the stored value, which is an unbounded on-chain integer. Past this many stops
// the blocks get narrower than the gaps between them, so a long range draws a
// continuous slider instead.
const MAX_BLOCKS = 24;

// Half the width of the stop's own label (its 44px mobile hit target), and how
// close to an end, as a fraction of the bar, that label may sit before the end
// label under it steps aside.
const HALF_LABEL = "1.375rem";
const END_LABEL_CLEARANCE = 0.15;

const STEPPER_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 sm:h-8 sm:w-8";

/**
 * The control behind every approval-power field: the wallet threshold and each
 * person's own power.
 *
 * The caller's `label` sits on one row with a stepper that holds the number,
 * so the number has one home. Under it a meter draws one block per unit of
 * power, which shows the range the number lives in: approval power only means
 * something against the power the wallet can reach, so the caller supplies
 * `min`/`max`. A block is a mouse shortcut to its number; the keyboard uses the
 * stepper.
 *
 * `fullAt` is the stop where the number is the whole thing there is: for a
 * threshold, where it takes every co-signer (2 on a wallet whose two co-signers
 * hold 1 each); for one person's power, where that person meets the threshold
 * alone. The blocks from that stop on are tinted whether filled or not, and
 * filled ones take the warm colour, so the state reads from the bar rather
 * than from the number.
 */
export function ApprovalPowerSlider({
  id,
  label,
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
  /** The field's `<Label>`, drawn on the stepper's row. Its id is `labelledBy`. */
  label: ReactNode;
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsApprovalPowerSlider");
  const parsed = Number.parseInt(value, 10);
  const exactValueNeedsEditor =
    /^\d+$/.test(value.trim()) && !Number.isSafeInteger(parsed);
  const [exactEditor] = useState(exactValueNeedsEditor);
  // The caller's ceiling ignores the number this control writes, so it cannot
  // shrink mid-gesture. A number stored above it still has to be representable,
  // so the range is widened once, from the value this control was first handed,
  // and never afterwards.
  const [storedTop] = useState(() => (Number.isFinite(parsed) ? parsed : min));
  const top = Math.max(max, storedTop);
  const current = Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), top) : min;
  const span = top - min;
  const marksFull = fullAt !== undefined && fullAt > min && fullAt <= top;
  const atFull = marksFull && current >= fullAt;
  const tone = invalid ? "invalid" : atFull ? "full" : "normal";
  const set = (next: number) => onChange(String(Math.min(Math.max(next, min), top)));
  // A blank or out-of-range stored value shows as the nearest stop without
  // being one. The first step then stores the shown number instead of moving
  // past it, so a blank threshold can still be set to `min`. A step that would
  // move a stored number the wrong way (raise one below `min` by pressing
  // Decrease) is not offered.
  const blank = !Number.isFinite(parsed);
  const shownIsStored = parsed === current;
  const canStep = (delta: number) => blank || (delta < 0 ? current > min : current < top);
  const step = (delta: number) => {
    if (canStep(delta)) set(shownIsStored ? current + delta : current);
  };

  // Radix sliders use JavaScript numbers. Keep an exact large on-chain value
  // visible, but do not let a pointer gesture round and overwrite it.
  if (exactEditor || exactValueNeedsEditor) {
    return (
      <div className={cn("space-y-1", className)}>
        {label}
        <Input
          id={id}
          inputMode="numeric"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid || !isNonNegativeUint64Decimal(value) || BigInt(value || "0") < BigInt(min) || undefined}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono tabular-nums"
        />
      </div>
    );
  }

  const valueTone = cn(
    "tabular-nums",
    tone === "invalid" && "text-[hsl(0_84%_60%)]",
    tone === "full" && "text-[hsl(var(--brand-warm))]",
    tone === "normal" && "text-foreground"
  );

  // A control with a single reachable stop is a decoration: with no co-signers
  // yet, `max` collapses onto `min`.
  if (span <= 0) {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        {label}
        <p id={id} aria-labelledby={labelledBy} className={cn("text-base font-semibold", valueTone)}>
          {current}
        </p>
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[
      event.key
    ];
    const absolute = { Home: min, End: top }[event.key];
    if ((delta === undefined && absolute === undefined) || disabled) return;
    event.preventDefault();
    if (absolute !== undefined) set(absolute);
    else if (delta !== undefined) step(delta);
  };

  const fractionOf = (point: number) => (point - min) / span;
  // Counted before any array is built: a stored range can be millions wide.
  const asBlocks = span + 1 <= MAX_BLOCKS;
  const stops = asBlocks ? Array.from({ length: span + 1 }, (_, index) => min + index) : [];
  // Where a stop's label sits under the bar: a block's middle, or a slider stop.
  const centreOf = (point: number) =>
    asBlocks ? (point - min + 0.5) / (span + 1) : fractionOf(point);
  // The stop's own label is wide enough to cover an end label it sits close to;
  // that end label then steps aside rather than being overprinted.
  const fullCentre = marksFull ? centreOf(fullAt) : 0.5;
  const hidesMin = Boolean(fullAtHint) && fullCentre < END_LABEL_CLEARANCE;
  const hidesTop = Boolean(fullAtHint) && fullAt !== top && fullCentre > 1 - END_LABEL_CLEARANCE;
  const fullStop =
    marksFull && fullAtHint ? (
      <Tooltip content={fullAtHint}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => set(fullAt)}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1 sm:min-h-6 sm:min-w-6",
            "font-semibold text-[hsl(var(--brand-warm))] underline decoration-dotted underline-offset-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed"
          )}
        >
          {fullAt}
        </button>
      </Tooltip>
    ) : null;

  return (
    <div data-approval-power className={cn("space-y-2", disabled && "opacity-60", className)}>
      <div className="flex items-center justify-between gap-3">
        {label}
        <div className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-border/60 bg-background/40">
          <button
            type="button"
            aria-label={i18n("decrease")}
            aria-describedby={labelledBy}
            aria-controls={id}
            disabled={disabled || !canStep(-1)}
            onClick={() => step(-1)}
            className={STEPPER_BUTTON}
          >
            <Minus aria-hidden="true" className="h-4 w-4" />
          </button>
          <span
            id={id}
            role="spinbutton"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-valuenow={current}
            aria-valuemin={min}
            aria-valuemax={top}
            aria-invalid={invalid ? true : undefined}
            aria-disabled={disabled ? true : undefined}
            onKeyDown={onKeyDown}
            className={cn(
              "min-w-10 border-x border-border/60 px-2 text-center text-base font-semibold leading-8",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              valueTone
            )}
          >
            {current}
          </span>
          <button
            type="button"
            aria-label={i18n("increase")}
            aria-describedby={labelledBy}
            aria-controls={id}
            disabled={disabled || !canStep(1)}
            onClick={() => step(1)}
            className={STEPPER_BUTTON}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {asBlocks ? (
        <div className="flex gap-1">
          {stops.map((stop) => {
            const filled = stop <= current;
            const inZone = marksFull && stop >= fullAt;
            return (
              // Not in the tab order and hidden from assistive tech: the
              // spinbutton above is the accessible control for the same number.
              // Pressing one keeps focus where it was, so focus never lands on
              // an element screen readers cannot see.
              <button
                key={stop}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                data-filled={filled || undefined}
                disabled={disabled}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => set(stop)}
                className={cn(
                  "relative h-2.5 min-w-0 flex-1 rounded-[3px] transition-colors duration-150",
                  "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                  "disabled:cursor-not-allowed",
                  !filled && "bg-muted/60 hover:bg-muted",
                  !filled && inZone && "bg-[hsl(var(--brand-warm)/0.2)] hover:bg-[hsl(var(--brand-warm)/0.35)]",
                  filled && tone === "invalid" && "bg-[hsl(0_84%_60%)]",
                  filled && tone !== "invalid" && (inZone ? "bg-[hsl(var(--brand-warm))]" : "bg-[hsl(var(--brand-teal))]")
                )}
              />
            );
          })}
        </div>
      ) : (
        <Slider
          min={min}
          max={top}
          step={1}
          value={[current]}
          disabled={disabled}
          onValueChange={([next]) => set(next ?? min)}
          zoneFraction={marksFull ? fractionOf(fullAt - 0.5) : undefined}
          rangeClassName={cn(
            tone === "invalid" && "bg-[linear-gradient(90deg,hsl(20_90%_58%),hsl(0_84%_60%))]",
            tone === "full" && "bg-[linear-gradient(90deg,hsl(var(--brand-teal)),hsl(var(--brand-warm)))]"
          )}
          // The spinbutton is the keyboard control; this thumb is a pointer
          // shortcut over a long range, so it stays out of the tab order. Radix
          // focuses it on every drag, so it stays named rather than hidden.
          thumbProps={{
            tabIndex: -1,
            "aria-labelledby": labelledBy,
            "aria-describedby": describedBy,
            "aria-invalid": invalid ? true : undefined
          }}
        />
      )}

      {/* The slider's thumb centre travels half a thumb in from each end, so its
          scale takes the same inset. */}
      <div
        className={cn(
          "relative flex min-h-6 items-center justify-between text-[11px] leading-4 text-muted-foreground tabular-nums",
          !asBlocks && "mx-2.5"
        )}
      >
        <span className={cn(hidesMin && "invisible")}>{min}</span>
        {fullStop && fullAt !== undefined && fullAt !== top ? (
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            // Kept a half-label in from both edges so it never spills out.
            style={{ left: `clamp(${HALF_LABEL}, ${centreOf(fullAt) * 100}%, calc(100% - ${HALF_LABEL}))` }}
          >
            {fullStop}
          </span>
        ) : null}
        {fullStop && fullAt === top ? fullStop : <span className={cn(hidesTop && "invisible")}>{top}</span>}
      </div>
    </div>
  );
}
