"use client";
import type { ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils/cn";

/**
 * A hover/focus tooltip.
 *
 * Note the difference from `InfoHint`, which is a click popover: a tooltip opens
 * on hover and focus only, so a touch user never sees it. Use this for a hint
 * that repeats something already on screen; use `InfoHint` when the text is the
 * only place the reader can learn it. Radix links the content with
 * `aria-describedby`, so a screen reader still announces it.
 */
export function Tooltip({
  content,
  children,
  className
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={8}
            collisionPadding={12}
            className={cn(
              "z-50 max-w-64 rounded-md border border-border/60 bg-popover px-2.5 py-1.5",
              "text-xs leading-snug text-popover-foreground shadow-lg",
              className
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
