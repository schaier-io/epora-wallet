import { cn } from "@/lib/utils/cn";

/**
 * A check mark that draws itself: the ring closes, then the tick strokes in. It stands in for
 * a static `CheckCircle2` at the moment something becomes final (a transaction confirmed),
 * so the change from "waiting" to "done" is seen, not just swapped. Decorative; the text
 * beside it carries the state. Reduced motion shows it drawn.
 */
export function ConfirmedCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("confirmed-check h-4 w-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle className="confirmed-check-ring" cx="12" cy="12" r="10" pathLength={1} strokeDasharray="1" transform="rotate(-90 12 12)" />
      <path className="confirmed-check-tick" d="m8 12.5 2.8 2.8L16.5 9.5" pathLength={1} strokeDasharray="1" />
    </svg>
  );
}
