import { cn } from "@/lib/utils/cn";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-[hsl(195_25%_10%)]",
        "ring-1 ring-inset ring-border/30",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[skeleton-shimmer_1.6s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-primary/8 before:to-transparent",
        "motion-reduce:before:animate-none",
        className
      )}
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-6 shadow-panel">
      <div className="space-y-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
    </div>
  );
}
