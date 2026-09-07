import * as React from "react";
import { cn } from "@/lib/utils/cn";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // 16px on mobile, 14px from `sm` up: iOS Safari zooms the page on focus below 16px.
        // Matches `Input` and `Select`.
        "flex min-h-[96px] w-full rounded-md border border-input bg-background/70 px-3 py-2 text-base sm:text-sm",
        "ring-offset-background transition-colors duration-150",
        // AA wants 4.5:1 and /70 measured 4.18:1 against the input background. /80 is 5.17:1.
        "placeholder:text-muted-foreground/80",
        "hover:border-primary/30",
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
Textarea.displayName = "Textarea";

export { Textarea };
