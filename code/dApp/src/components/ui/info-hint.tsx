"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

type InfoHintProps = {
  children: ReactNode;
  label?: string;
  className?: string;
  contentClassName?: string;
};

/**
 * A small "tell me more" disclosure behind an ⓘ button.
 *
 * A popover, not a tooltip. A tooltip opens on hover and focus and nothing else, so on a
 * touch screen there was no way to read any of these 16 hints: tapping the button did
 * nothing at all. A screen-reader user got the text from an `sr-only` copy, which made a
 * sighted person on a phone the only user with no route to it.
 *
 * The popover opens on click, tap and Enter alike, closes on Escape or a click outside, and
 * hands focus back to the button afterwards. One interaction, everybody.
 */
export function InfoHint({
  children,
  label = "More details",
  className,
  contentClassName
}: InfoHintProps) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "data-[state=open]:border-primary/40 data-[state=open]:text-foreground",
            className
          )}
          // Stops the hint from also activating whatever the button sits inside. NOT
          // `preventDefault()`: Radix composes its own toggle behind this handler and skips
          // it when the default is prevented, which is how the old tooltip trigger managed
          // to be dead on click as well as on tap.
          onClick={(event) => event.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-50 max-w-xs rounded-md border border-border/70 bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md",
            "focus-visible:outline-none",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
            contentClassName
          )}
        >
          {children}
          <PopoverPrimitive.Arrow className="fill-popover" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
