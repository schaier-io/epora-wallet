import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border/80 text-foreground",
        warning: "border-amber-400/30 bg-amber-500/15 text-amber-200",
        success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
        info: "border-sky-400/30 bg-sky-500/15 text-sky-200",
        destructive: "border-rose-500/30 bg-rose-500/15 text-rose-200"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
