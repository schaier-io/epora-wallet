import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading fallback while the workspace bundle is fetched and wallet data
 * resolves. Deliberately mirrors the loaded layout shape (top header strip +
 * three-column workspace) so the swap into the real UI feels like content
 * filling in rather than the layout itself appearing.
 */
export default function UserLoading() {
  return (
    <div
      className="page-shell flex flex-1 flex-col motion-safe:animate-[section-fade-in_320ms_cubic-bezier(0.22,1,0.36,1)_both]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="container flex flex-1 flex-col gap-5 py-3 md:py-4">
        {/* Workspace header strip */}
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/85 px-4 py-5 md:px-5 md:py-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <Skeleton className="h-5 w-44" />
            <div className="ml-auto hidden gap-2 md:flex">
              <Skeleton className="h-6 w-32 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          </div>
        </div>

        {/* Body + sidebar layout */}
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
          {/* Sidebar */}
          <div className="hidden flex-col gap-3 rounded-3xl border border-border/70 bg-card/70 p-4 xl:flex">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="mt-4 h-3 w-28" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="mt-4 h-3 w-16" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>

          {/* Body — wallet home shape */}
          <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/70 p-5">
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-72" />
            </div>

            {/* Hero card */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-48" />
                  <Skeleton className="h-5 w-44 rounded-full" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-12 w-36" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>

            {/* Assets */}
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>

            {/* People tiles */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>

            {/* Recent activity */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
