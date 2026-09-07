"use client"

import * as React from "react"
import { Accordion as AccordionPrimitive } from "radix-ui"

import { cn } from "@/lib/utils/cn"
import { ChevronDownIcon } from "lucide-react"

function Accordion({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("not-last:border-b", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          // `ring-ring/50` measured 1.89:1 against the card surface these sit on, under the
          // 3:1 WCAG 1.4.11 floor for a focus indicator. Full-opacity `--ring` measures
          // 3.76:1. `transition-all` also animated every property the trigger owns; only
          // colour and the ring ever change on hover or focus.
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-3 text-left text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow] duration-150 hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
        {/* One chevron rotated by an interruptible transition, not two swapped with
            `hidden`/`inline`: a visibility toggle cannot animate and cannot be interrupted
            half-way when the user closes the item again. */}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className="pointer-events-none shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-aria-expanded/accordion-trigger:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      // `data-open:` / `data-closed:` compile to `[data-open]` / `[data-closed]`, and Radix
      // emits neither: the accordion primitive only ever sets `data-state`. Both animations
      // were dead, so every panel snapped open and shut at full height.
      className="overflow-hidden text-sm data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          "pt-0 pb-3 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
