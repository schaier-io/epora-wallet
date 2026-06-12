import { cn } from "@/lib/utils/cn";

type SeparatorProps = {
  className?: string;
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
};

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true
}: SeparatorProps) {
  return (
    <div
      role={decorative ? "presentation" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "bg-border/70",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
    />
  );
}
