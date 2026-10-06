import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { fieldChrome } from "@/components/ui/field-styles";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        fieldChrome,
        // Vertical resize only: a sideways drag pushed the field out of its card.
        "flex min-h-24 resize-y px-3 py-2.5 leading-relaxed",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
