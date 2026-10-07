"use client";
import { useId } from "react";
import { Check, Plus } from "lucide-react";

import { cn } from "@/lib/utils/cn";

// One permission as a pressable pill: pressing grants it, pressing again takes it away.

export function PermissionChip({
  label,
  pressed,
  disabled,
  title,
  onClick
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  const descriptionId = useId();

  return (
    <>
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      // What the permission grants used to live only in `title`, which no touch user can
      // open and which assistive tech announces inconsistently. It is a description of a
      // chip already named "Owner", not part of that name, so it goes in the sr-only span
      // below rather than into `aria-label`: extending the name would make these four
      // toggles announce a sentence each before saying which one they are.
      aria-describedby={title ? descriptionId : undefined}
      // Kept as the pointer route to the same sentence.
      title={title}
      onClick={onClick}
      className={cn(
        "user-surface user-task-chip relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color]",
        // 30 CSS painted, 44 to a finger. The pill keeps its own size: growing it would
        // push every wrapped row of chips down.
        "after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-['']",
        pressed
          ? "border-primary/45 bg-primary/12 text-foreground"
          : "border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45"
      )}
    >
      {pressed ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
    {/* `sr-only` is `position: absolute`, so this adds no flex item to the chip row. */}
    {title ? (
      <span id={descriptionId} className="sr-only">
        {title}
      </span>
    ) : null}
    </>
  );
}
