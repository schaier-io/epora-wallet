import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading fallback while the workspace bundle is fetched. It mirrors the layout the route
 * actually resolves to so the swap into the real UI reads as content filling in, not as the
 * layout itself appearing.
 *
 * That layout is the welcome screen, not the connected workspace. `walletReadyAtom`
 * (`providers/wallet.atoms.ts:24`) is derived from `activeWalletAtom`, which starts null on
 * every page load, so `workspace-view.tsx:161` renders `WorkspaceOnboardingView` first for
 * every visitor, returning or not. This file used to draw the connected two-column workspace:
 * a sidebar of nine rows, a hero card with four buttons, an assets panel, a row of four
 * tiles. None of that is what appeared next. Measured at a 1280 viewport, the skeleton
 * promised a full-height two-column grid and the page resolved to a single 883px card, so the
 * one route the app opens on jumped its entire layout on hydration.
 *
 * The chrome is copied from the real components rather than invented, and the measurements
 * below are of the running page at a 768px container:
 * header strip 122 tall, its row 72 (a 40px badge beside a 23px heading over a 46px line);
 * the welcome card 883, holding three steps at 69/85/68 inside `divide-y`, then a
 * `border-t pt-6` block of 204 (a 44px button, a 20px line, a 91px paragraph), then a
 * `border-t pt-6` block of 360 holding the seven FAQ rows at 45 each.
 */
/**
 * Two of the seven questions wrap to a second line at 375, and all three steps wrap by a
 * different amount. These are the heights each block measures on the running page at that
 * width; above `sm` every one of them is a single line again.
 */
const STEP_BODY_HEIGHTS = ["h-[47px]", "h-[69px]", "h-[68px]"];
const FAQ_ROW_HEIGHTS = ["h-5", "h-5", "h-[41px]", "h-[41px]", "h-5", "h-5", "h-5"];

export default function UserLoading() {
  const i18n = useTranslations("AppUserLoading");
  return (
    <div
      className="page-shell flex flex-1 flex-col motion-safe:animate-[section-fade-in_320ms_cubic-bezier(0.22,1,0.36,1)_both]"
      aria-busy="true"
      aria-live="polite"
    >
      {/*
        The live region needs something to read. This file carried `aria-live="polite"` over
        a wall of `aria-hidden` skeletons, so a screen reader was told a region had updated
        and then found nothing in it. The line is `sr-only` because the whole point of the
        layout below is to look like the loaded page, and a visible "Loading…" would break
        the mirror it exists to hold.
      */}
      <span className="sr-only">{i18n("loadingYourWallet")}</span>
      <div className="container flex flex-1 flex-col py-3 md:py-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Workspace header strip (workspace-header-view.tsx) */}
          {/* `mx-auto w-full max-w-3xl` because the real header takes exactly that while no
              wallet is connected (`workspace-header-view.tsx:236`), so it lines up with the
              card below it. Without it the skeleton's strip ran the full 1200 and the page
              resolved to 768. */}
          <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-border/70 bg-card/85 p-4 sm:p-6">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-5 w-56 sm:h-[23px]" />
                {/* One block per wrapped paragraph, sized to what that paragraph measures at
                    each width. A stack of fixed lines cannot follow copy that rewraps. */}
                <Skeleton className="h-[78px] w-full max-w-2xl sm:h-[46px]" />
              </div>
            </div>
          </div>

          {/* Welcome card (workspace-onboarding-view.tsx), centred and capped, as there. */}
          <div className="flex min-h-0 flex-1 items-start justify-center pt-2 md:pt-6">
            <div className="w-full max-w-3xl">
              <div className="rounded-xl border border-border/70 bg-card/85 p-4 sm:p-6">
                <div className="space-y-6">
                  {/* The three steps. The middle one wraps to a second line of body copy,
                      which is where its extra 16px comes from. */}
                  <ol className="divide-y divide-border/40">
                    {STEP_BODY_HEIGHTS.map((bodyHeight) => (
                      <li
                        key={bodyHeight}
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 py-4 first:pt-0 last:pb-0"
                      >
                        <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
                        <div className="space-y-1">
                          <Skeleton className="h-5 w-52 sm:h-5" />
                          <Skeleton className={`${bodyHeight} w-full sm:h-7`} />
                        </div>
                      </li>
                    ))}
                  </ol>

                  {/* Connect, the line under it, and what connecting grants. */}
                  <div className="space-y-4 border-t border-border/60 pt-6">
                    <div className="space-y-2">
                      <Skeleton className="h-12 w-full rounded-md sm:h-11 sm:w-[249px]" />
                      <Skeleton className="h-10 w-80 max-w-full sm:h-5" />
                    </div>
                    <Skeleton className="h-[159px] w-full max-w-[68ch] sm:h-[91px]" />
                  </div>

                  {/* The FAQ list (product-faq-list.tsx): an eyebrow over seven rows. */}
                  <div className="border-t border-border/60 pt-6">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <div className="divide-y divide-border/40">
                        {FAQ_ROW_HEIGHTS.map((rowHeight, index) => (
                          <div key={`${rowHeight}-${index}`} className="py-3">
                            <Skeleton className={`${rowHeight} w-3/4 sm:h-5`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
