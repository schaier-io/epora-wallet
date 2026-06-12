import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { type TaskDefinition } from "@/components/user/flow-types";
import type { ReviewReceiptItem } from "@/components/user/review-panel";

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
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium text-foreground">{receiptTitle}</p>
      </div>
      {receiptSummary ? (
        <p
          className={cn(
            "mt-2 leading-relaxed text-foreground",
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
                  // line when the label is long — so short values like
                  // "0 rules" never truncate to "0 rul…".
                  "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-2.5 py-1.5",
                  item.tone === "success" && "bg-emerald-500/10",
                  item.tone === "warning" && "bg-amber-500/10"
                )}
              >
                <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground" title={item.value}>
                  {item.value}
                </dd>
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
                  item.tone === "success" && "border-emerald-500/30 bg-emerald-500/10",
                  item.tone === "warning" && "border-amber-500/30 bg-amber-500/10"
                )}
              >
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-foreground">
                  {item.value}
                </dd>
                {item.detail ? (
                  <dd className="mt-1 text-xs leading-snug text-muted-foreground">
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
  return compact ? (
    <details className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        What this does
      </summary>
      <div className="mt-3 space-y-4 border-t border-border/40 pt-3 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            When to use it
          </p>
          <p className="mt-1.5 text-foreground">{definition.whenToUse}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What changes
          </p>
          <p className="mt-1.5 text-foreground">{definition.whatChanges}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            First step
          </p>
          <p className="mt-1.5 text-foreground">{definition.startingPoint}</p>
        </div>
      </div>
    </details>
  ) : (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          When to use it
        </p>
        <p className="mt-1.5 text-foreground">{definition.whenToUse}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What changes
        </p>
        <p className="mt-1.5 text-foreground">{definition.whatChanges}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          First step
        </p>
        <p className="mt-1.5 text-foreground">{definition.startingPoint}</p>
      </div>
    </div>
  );
}
