import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { type TaskDefinition } from "@/components/user/flow-types";
import type { ReviewReceiptItem } from "@/components/user/review-panel";
import { AddressCopyButton } from "@/components/ui/address-copy-button";

// Presentational sections lifted out of `UserReviewPanel` to keep that file
// focused on orchestration. Each renders purely from its props.

export function ReviewReceiptCard({
  receiptTitle,
  receiptSummary,
  receiptItems,
  compact
}: {
  receiptTitle: string;
  receiptSummary?: string;
  receiptItems: ReviewReceiptItem[];
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-primary/20 bg-primary/5",
        compact ? "p-3" : "p-4"
      )}
    >
      {/* No check mark. This card previews what a transaction WILL do, and it renders
          the same whether the action is ready or blocked: the create-wallet rail showed a
          teal `CheckCircle2` beside "Create wallet" while the same panel said "Add at least
          one owner", the form said "Needs review" and Create said "Not built yet". A tick in
          the colour DESIGN.md reserves for "confirmed safe progress" is the one mark that
          must never appear before the thing is confirmed. The title carries the meaning.
          The same rule keeps "success" rows untinted: a green row reads as done. Only the
          amber "warning" rows stand out, because they name something still missing. */}
      <p className="text-sm font-medium text-foreground">{receiptTitle}</p>
      {receiptSummary ? (
        <p
          className={cn(
            "mt-2 wrap-anywhere leading-relaxed text-foreground",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {receiptSummary}
        </p>
      ) : null}
      {receiptItems.length > 0 ? (
        compact ? (
          <dl className="mt-3 divide-y divide-border/40 rounded-md border border-border/40 bg-background/30">
            {receiptItems.map((item) => (
              <div
                key={`${item.label}-${item.value}`}
                className={cn(
                  // flex-wrap: inline when both fit, value drops to its own
                  // line when the label is long, so short values like
                  // "0 scheduled payments" wraps instead of truncating.
                  item.copyValue && item.copyLabel
                    ? "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2"
                    : "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-2 py-2",
                  item.tone === "warning" && "bg-amber-500/10"
                )}
              >
                <dt className="eyebrow font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd
                  className={cn(
                    "min-w-0 text-xs font-medium text-foreground",
                    item.copyValue && item.copyLabel
                      ? "truncate text-right"
                      : "break-words"
                  )}
                  title={item.copyValue ?? item.value}
                >
                  {item.value}
                  {item.copyValue && !item.copyLabel ? (
                    <AddressCopyButton value={item.copyValue} className="ml-1 inline-flex align-middle" />
                  ) : null}
                </dd>
                {item.copyValue && item.copyLabel ? (
                  <dd>
                    <CopyButton
                      value={item.copyValue}
                      label={item.copyLabel}
                      copiedLabel={item.copiedLabel}
                      hideLabel
                      variant="ghost"
                      className="h-7 w-7 shrink-0 p-0"
                    />
                  </dd>
                ) : null}
                {item.detail ? (
                  // Compact is the only mode the app ever renders (the single call site in
                  // workspace-review-rail-view.tsx passes it unconditionally), so a `detail`
                  // shown only in the full branch was authored and never seen. `basis-full`
                  // drops it onto its own line under the label/value pair.
                  //
                  // `min-w-0 break-words` mirrors the value `<dd>` above. A flex item keeps
                  // `min-width: auto`, so a 103-character bech32 address held the row wider
                  // than the rail and `overflow-hidden` cut it mid-string with no ellipsis.
                  <dd
                    className={cn(
                      "min-w-0 break-words text-xs leading-snug text-muted-foreground",
                      item.copyValue && item.copyLabel ? "col-span-3" : "basis-full"
                    )}
                  >
                    {item.detail}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        ) : (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {receiptItems.map((item) => (
              <div
                key={`${item.label}-${item.value}`}
                className={cn(
                  "rounded-md border border-border/60 bg-background/45 px-3 py-2",
                  item.tone === "warning" && "border-amber-500/30 bg-amber-500/10"
                )}
              >
                <dt className="eyebrow font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-foreground">
                  {item.value}
                  <AddressCopyButton value={item.copyValue} className="ml-1 inline-flex align-middle" />
                </dd>
                {item.detail ? (
                  <dd className="mt-1 break-words text-xs leading-snug text-muted-foreground">
                    {item.detail}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        )
      ) : null}
    </div>
  );
}

export function ReviewActionExplainer({
  definition,
  compact
}: {
  definition: TaskDefinition;
  compact: boolean;
}) {
  const i18n = useTranslations("ComponentsUserReviewPanelSections");
  return compact ? (
    <details className="rounded-md border border-border/50 bg-muted/10 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="expand-chevron h-4 w-4 shrink-0" aria-hidden="true" />
        {i18n("whatThisDoes")}
      </summary>
      <div className="mt-3 space-y-3 border-t border-border/40 pt-3 text-sm">
        <div>
          <p className="eyebrow font-medium text-muted-foreground">
            {i18n("whenToUseIt")}
          </p>
          <p className="mt-1.5 text-foreground">{definition.whenToUse}</p>
        </div>
        <div>
          <p className="eyebrow font-medium text-muted-foreground">
            {i18n("whatChanges")}
          </p>
          <p className="mt-1.5 text-foreground">{definition.whatChanges}</p>
        </div>
        <div>
          <p className="eyebrow font-medium text-muted-foreground">
            {i18n("firstStep")}
          </p>
          <p className="mt-1.5 text-foreground">{definition.startingPoint}</p>
        </div>
      </div>
    </details>
  ) : (
    <div className="space-y-4 text-sm">
      <div>
        <p className="eyebrow font-medium text-muted-foreground">
          {i18n("whenToUseIt")}
        </p>
        <p className="mt-1.5 text-foreground">{definition.whenToUse}</p>
      </div>
      <div>
        <p className="eyebrow font-medium text-muted-foreground">
          {i18n("whatChanges")}
        </p>
        <p className="mt-1.5 text-foreground">{definition.whatChanges}</p>
      </div>
      <div>
        <p className="eyebrow font-medium text-muted-foreground">
          {i18n("firstStep")}
        </p>
        <p className="mt-1.5 text-foreground">{definition.startingPoint}</p>
      </div>
    </div>
  );
}
