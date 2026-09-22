/** Shared Tailwind class strings for the guided sidebar/section cards. */
// The selected ring is `inset`. Every card carrying this class fills a `SpotlightCard`,
// which is `relative overflow-hidden` so the spotlight stays inside the rounded rect. The
// card is `w-full` inside that wrapper, so its border box IS the clip rect: an outset
// `0 0 0 1px` ring paints entirely outside the clip and never reaches the screen. That left
// the selected card wearing `border-emerald-400/35` alone -- a 35%-alpha line over its own
// near-opaque gradient -- which read as no border at all next to the idle
// `border-border/55` cards. An inset ring paints inside the border box, so it survives.
// `workspace-wallet-selection-dialog-view.tsx:149` rings its own `overflow-hidden` card the
// same way.
export const guidedSidebarActiveSurfaceClass =
    "border-emerald-400/35 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(14,116,144,0.24),rgba(16,185,129,0.18))] shadow-[inset_0_0_0_1px_rgba(45,212,191,0.14)]";
export const guidedSidebarIdleSurfaceClass =
    "border-border/55 bg-background/20 hover:border-emerald-400/20 hover:bg-background/65";
export const guidedSidebarIconBaseClass =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-[background-color,border-color,color,transform] duration-200 ease-out";
export const guidedSidebarIconActiveClass =
    "border-emerald-300/20 bg-white/10 text-emerald-100";
export const guidedSidebarIconIdleClass =
    "border-border/60 bg-background/60 text-muted-foreground";
/**
 * The `SpotlightCard` these buttons sit in. It carries the hover lift, because the card is
 * `relative overflow-hidden` (it has to be, to clip the spotlight to the rounded rect) and
 * a lift on the button inside it pushed the button's top border under that clip: hovering
 * a row made its top edge vanish. Lifting the clipping element itself moves the border
 * with it.
 */
export const guidedSidebarSpotlightClass =
    "user-card-lift min-w-0 rounded-lg transition-transform duration-200 ease-out";
// `items-center` and a tighter `py` on the action and overview rows, because those carry a
// title and nothing else. They kept the height and the top alignment of the three-line
// cards they used to be, which left a single line of text sitting high in a 64px box.
// `workspace-guided-admin-section-view.tsx` still renders title, badges and a description,
// so it writes its own padding and alignment instead of using this. It takes the lift from
// `guidedSidebarSpotlightClass` above like every other card list, and must not carry
// `user-card-lift` itself: two lifts on nested elements double the travel and put the inner
// border back under the clip.
export const guidedSidebarButtonClass =
    "user-surface user-sidebar-card relative z-10 flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow]";
export const guidedSidebarTextClass = "min-w-0 flex-1 overflow-hidden";
export const guidedSidebarTitleClass =
    "min-w-0 text-sm font-semibold leading-tight text-foreground";
export const guidedSidebarDescriptionClass =
    "user-sidebar-copy mt-1 text-xs leading-snug text-muted-foreground";
export const guidedSidebarChevronClass =
    "user-sidebar-chevron h-4 w-4 shrink-0 transition-[opacity,color,transform] duration-200 ease-out";
