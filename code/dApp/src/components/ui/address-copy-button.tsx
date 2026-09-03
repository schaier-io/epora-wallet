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
      className={cn("h-6 px-1.5", className)}
    />
  );
}
