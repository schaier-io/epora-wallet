/**
 * The chrome every text-entry control shares: `Input`, `Select` and `Textarea`.
 *
 * The three primitives each carried a hand-copied class string, and the copies had
 * started to drift. One string means a border, focus or invalid change lands on all
 * three at once. Height and padding stay per primitive: a textarea grows, and a select
 * reserves room on the right for its chevron (see `form-controls.css`).
 */
export const fieldChrome = [
  // 16px on mobile, 14px from `sm` up. iOS Safari zooms the whole page when a focused
  // field's text is under 16px, and the page never zooms back out.
  "w-full rounded-md border border-input bg-background/70 text-base text-foreground sm:text-sm",
  "ring-offset-card transition-[color,background-color,border-color,box-shadow] duration-150",
  // AA wants 4.5:1 and /70 measured 4.18:1 against the field background. /80 is 5.17:1.
  "placeholder:text-muted-foreground/80",
  // `enabled:` so a disabled field does not answer the pointer.
  "enabled:hover:border-primary/30",
  "focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  // Same treatment as a disabled `Button`: a muted fill and muted text, not a 50% fade
  // that leaves the value hard to read.
  "disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-muted/40 disabled:text-muted-foreground",
  "aria-[invalid=true]:border-rose-500/60 aria-[invalid=true]:focus-visible:ring-rose-500/40"
].join(" ");

/**
 * Single-line field height. 44px on touch, 40px from `sm` up, the same step `Button`
 * takes, so a field and the button beside it line up at every width.
 */
export const fieldHeight = "h-11 sm:h-10";
