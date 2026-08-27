import * as React from "react";
import { cn } from "@/lib/utils/cn";

function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      // `block`, not the browser default `inline`. Vertical margins have no effect on a
      // non-replaced inline box, so every `space-y-*` on a label/control pair was setting a
      // margin the layout then discarded -- a declared 6px rendered as 2.5px of inline
      // leading. No call site needs this label inline; all 78 stack it above a control.
      className={cn("block text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  );
}

export { Label };
