import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * How far a request is towards its signatures, as a ring that fills. Decoration beside the
 * progress sentence, which stays the accessible text, so the ring is `aria-hidden`. It fills
 * from empty when it mounts; the detail view remounts it whenever verification reloads, which
 * includes a new signature. Nothing is drawn while the total is unknown: an empty ring would claim
 * "none yet".
 */
export function SignerRing({
  fraction,
  className
}: {
  fraction: number | null;
  className?: string;
}) {
  if (fraction === null) return null;
  const offset = 1 - Math.min(1, Math.max(0, fraction));
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("signer-ring h-3.5 w-3.5 shrink-0 -rotate-90", className)}
      style={{ "--signer-ring-offset": offset } as CSSProperties}
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <circle
        className="signer-ring-fill"
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
      />
    </svg>
  );
}
