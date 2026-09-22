"use client";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * What a `dynamic()` boundary shows while its chunk arrives.
 *
 * The three boundaries that use it each drew this block themselves, and each one
 * drew the spinner with no text beside it. The row it sits in is
 * `inline-flex items-center gap-2 text-sm text-muted-foreground`, which is the
 * shape of a label and a spinner, so the label had been lost rather than left
 * out: `app/loading.tsx` has the same row with its text intact. The icon is
 * `aria-hidden`, so a screen reader was given a busy region holding nothing to
 * read, and a sighted reader got a spinner that named nothing.
 *
 * It is a component, not markup inlined in each `loading:` callback, because
 * Next calls that callback during render, where a hook would not be safe.
 */
export function LazyChunkFallback({ cards = 1 }: { cards?: number }) {
  const i18n = useTranslations("ComponentsUiLazyChunkFallback");
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {i18n("loadingThisSection")}
      </p>
      {Array.from({ length: cards }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
