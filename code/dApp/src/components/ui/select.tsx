import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A native `<Select>` wearing the same chrome as `Input` and `Textarea`.
 *
 * There were 18 native selects across four hand-written class strings. Four of them
 * omitted the focus ring entirely and fell back to the browser's default outline while
 * the input beside them drew the app ring, and one sat at 32px in a 40px row. The
 * `aria-[invalid=true]` rule matches `Input`, so a rejected select gets the rose border
 * for free once something sets the attribute.
 *
 * Native on purpose: the platform control is keyboard- and screen-reader-correct out of
 * the box, and on touch it opens the OS picker. A custom listbox would have to re-earn
 * all of that.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm",
        "ring-offset-background transition-colors duration-150",
        "hover:border-input/80",
        "focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-rose-500/60 aria-[invalid=true]:focus-visible:ring-rose-500/40",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Select.displayName = "Select";

export { Select };
