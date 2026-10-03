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
  className,
  label
}: {
  value?: string | null;
  className?: string;
  label?: string;
}) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  return (
    <CopyButton
      value={value}
      label={label}
      hideLabel
      variant="ghost"
      size="sm"
      // Give touch users 44px; keep desktop rows at 24px.
      className={cn(
        "relative h-11 min-w-11 px-1.5 sm:-my-1 sm:h-6 sm:min-w-6",
        className
      )}
    />
  );
}
