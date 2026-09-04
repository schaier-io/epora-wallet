"use client";
import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils/cn";

/**
 * A single-value slider over the Radix primitive, styled like the rest of the
 * form controls (same border, ring and disabled treatment as `Input`).
 *
 * `zoneFraction` shades the track from that position (0 to 1) to its right end.
 * It marks a stretch that means something on its own, whatever the thumb is
 * doing, e.g. the point past which a threshold takes everybody's approval
 * power. It sits under the range, so once the thumb is inside it the fill takes
 * over and the caller can recolour that instead.
 */
export function Slider({
  className,
  rangeClassName,
  zoneFraction,
  thumbProps,
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  rangeClassName?: string;
  zoneFraction?: number;
  thumbProps?: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb>;
}) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full border border-border/60 bg-muted/60">
        {zoneFraction === undefined ? null : (
          <span
            aria-hidden="true"
            style={{ left: `${zoneFraction * 100}%` }}
            className="absolute inset-y-0 right-0 border-l-2 border-[hsl(var(--brand-warm))] bg-[hsl(var(--brand-warm)/0.3)]"
          />
        )}
        <SliderPrimitive.Range
          className={cn(
            "absolute h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--brand-cyan)),hsl(var(--brand-teal)))]",
            rangeClassName
          )}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        {...thumbProps}
        className={cn(
          "block h-5 w-5 rounded-full border-2 border-[hsl(var(--brand-teal))] bg-background",
          "shadow-[0_2px_10px_-2px_hsl(var(--brand-teal)/0.7)]",
          "transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "hover:scale-110 active:scale-105",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          thumbProps?.className
        )}
      />
    </SliderPrimitive.Root>
  );
}
