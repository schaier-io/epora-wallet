import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading fallback while the workspace bundle is fetched and wallet data
 * resolves. It mirrors the loaded layout so the swap into the real UI reads as
 * content filling in, not as the layout itself appearing.
 *
 * The chrome is copied from the real components rather than invented. Every
 * card is `rounded-xl border-border/70 bg-card/85 p-4 sm:p-6`, which is what
 * `<Card>` owns (`components/ui/card.tsx`); the columns and order match
 * `workspace-layout-view.tsx`; the sidebar groups match
 * `workspace-sidebar-view.tsx`. This file used to use `rounded-3xl` (22px) and
 * `p-5`, so hydration moved every corner and edge on the primary route.
 *
 * The card wrapper was fixed first and the innards were not, so the jump moved
 * inward instead of going away. Each block below now carries the class string of
 * the component it stands for: the hero is `rounded-lg p-3 sm:p-4`
 * (`wallet-hero-card.tsx:112`), not `rounded-2xl p-3 sm:p-4`; its four buttons
 * stack below `sm` exactly as the real ones do, which is 184px rather than 88px
 * on a phone; the sidebar rows are `rounded-lg` (`workspace-sidebar-view.tsx:105`);
 * the assets panel is `p-3 sm:p-4` (`locked-assets-panel.tsx:153`); and the people
 * and rules block is one bordered flex row of four tiles
 * (`workspace-wallet-dashboard-view.tsx:235`), not a bare grid of three.
 *
 * Padding decreases with depth at every width: card 16/24 → panel 12/16 → row 8.
 */
export default function UserLoading() {
  return (
    <div
      className="page-shell flex flex-1 flex-col motion-safe:animate-[section-fade-in_320ms_cubic-bezier(0.22,1,0.36,1)_both]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="container flex flex-1 flex-col py-3 md:py-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Workspace header strip — workspace-header-view.tsx */}
          <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card/85 p-4 sm:p-6">
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

          {/* Body + sidebar — workspace-layout-view.tsx */}
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
            {/* Sidebar: groups at 16, rows at 8. Below the body until lg, as in the real layout. */}
            <div className="order-2 rounded-xl border border-border/70 bg-card/85 p-4 sm:p-6 lg:order-1 lg:self-start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              </div>
            </div>

            {/* Wallet home — workspace-wallet-dashboard-view.tsx */}
            <div className="order-1 rounded-xl border border-border/70 bg-card/85 p-4 sm:p-6 lg:order-2">
              {/* CardHeader */}
              <div className="space-y-2 pb-4">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-72" />
              </div>

              <div className="space-y-4">
                {/* Hero card */}
                <div className="relative overflow-hidden rounded-lg border border-primary/20 p-3 sm:p-4">
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
                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                </div>

                {/* Assets */}
                <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>

                {/* People and rules — one bordered row of four tiles, not a grid of three.
                    Matches workspace-wallet-dashboard-view.tsx's `peopleRules` block. */}
                <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3 rounded-lg border border-border/60 bg-background/35 p-3 sm:p-4">
                  <Skeleton className="h-14 min-w-[160px] flex-1" />
                  <Skeleton className="h-14 min-w-[160px] flex-1" />
                  <Skeleton className="h-14 min-w-[160px] flex-1" />
                  <Skeleton className="h-14 min-w-[160px] flex-1" />
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
      </div>
    </div>
  );
}
