import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { type TaskDefinition } from "@/components/user/flow-types";
import type { ReviewReceiptItem } from "@/components/user/review-panel";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

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
                  // line when the label is long, so short values like
                  // "0 scheduled payments" wraps instead of truncating.
                  "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2",
                  item.tone === "success" && "bg-emerald-500/10",
                  item.tone === "warning" && "bg-amber-500/10"
                )}
              >
                <dt className="eyebrow font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground" title={item.value}>
                  {item.value}
                </dd>
                {item.detail ? (
                  // Compact is the only mode the app ever renders (the single call site in
                  // workspace-review-rail-view.tsx passes it unconditionally), so a `detail`
                  // shown only in the full branch was authored and never seen. `basis-full`
                  // drops it onto its own line under the label/value pair.
                  //
                  // `min-w-0 break-words` mirrors the value `<dd>` above. A flex item keeps
                  // `min-width: auto`, so a 103-character bech32 address held the row wider
                  // than the rail and `overflow-hidden` cut it mid-string with no ellipsis.
                  <dd className="min-w-0 basis-full break-words text-xs leading-snug text-muted-foreground">
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
                  item.tone === "success" && "border-emerald-500/30 bg-emerald-500/10",
                  item.tone === "warning" && "border-amber-500/30 bg-amber-500/10"
                )}
              >
                <dt className="eyebrow font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-foreground">
                  {item.value}
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
      <summary className="cursor-pointer text-sm font-medium text-foreground">
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

/**
 * What the network charges to put this transaction on chain.
 *
 * Every builder computes `estimatedFeeLovelace`, and until now no surface read it: the user
 * was asked to sign without ever being told the cost. Four personas hit this. It renders
 * beside the amount rather than inside the technical disclosure, because it is money leaving
 * the wallet, not a diagnostic.
 */
export function ReviewNetworkFee({ estimatedFeeLovelace }: { estimatedFeeLovelace?: string }) {
  const i18n = useTranslations("ComponentsUserReviewPanelSections");
  if (!estimatedFeeLovelace) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-background/40 p-3">
      <p className="eyebrow text-muted-foreground">{i18n("networkFee")}</p>
      <p className="text-sm font-medium text-foreground">
        {formatLovelaceAsAda(estimatedFeeLovelace)} ₳
      </p>
      <p className="basis-full text-xs leading-snug text-muted-foreground">
        {i18n("paidToTheCardanoNetworkOnTopOf")}
      </p>
    </div>
  );
}
