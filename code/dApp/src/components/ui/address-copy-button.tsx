"use client";
import { cn } from "@/lib/utils/cn";

import { CopyButton } from "@/components/ui/copy-button";

/**
 * Icon-only copy affordance for a rendered address (truncated or full). Renders
 * nothing while there is no value, so rows like "Person #3" (no wallet linked
 * yet) or "Loading address…" never show a dead button.
 */
export function AddressCopyButton({
  value,
  className
}: {
  value?: string | null;
  className?: string;
}) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  return (
    <CopyButton
      value={value}
      hideLabel
      variant="ghost"
      size="sm"
      // The painted box drops to the 12px text line this sits on (`-my-1`), while the
      // `after:` band keeps the pressable area at 24px. `sm:h-5` has to ride along:
      // tailwind-merge keeps the size variant's own `sm:h-9` otherwise.
      className={cn(
        "relative -my-1 h-5 px-1.5 after:absolute after:inset-x-0 after:-inset-y-0.5 sm:h-5",
        className
      )}
    />
  );
}
