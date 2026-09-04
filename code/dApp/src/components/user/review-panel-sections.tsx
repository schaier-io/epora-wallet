import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { type TaskDefinition } from "@/components/user/flow-types";
import type { ReviewReceiptItem } from "@/components/user/review-panel";
import {
  type PresignCostRow,
  type PresignCostRowId
} from "@/lib/user-flow/presign-costs";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
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
                  item.copyValue && item.copyLabel
                    ? "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2"
                    : "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2",
                  item.tone === "success" && "bg-emerald-500/10",
                  item.tone === "warning" && "bg-amber-500/10"
                )}
              >
                <dt className="eyebrow font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd
                  className={cn(
                    "min-w-0 text-right text-xs font-medium text-foreground",
                    item.copyValue && item.copyLabel ? "truncate" : "break-words"
                  )}
                  title={item.copyValue ?? item.value}
                >
                  {item.value}
                  {item.copyValue && !item.copyLabel ? (
                    <AddressCopyButton value={item.copyValue} className="mx-1 inline-flex align-middle" />
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
                  item.tone === "success" && "border-emerald-500/30 bg-emerald-500/10",
                  item.tone === "warning" && "border-amber-500/30 bg-amber-500/10"
                )}
              >
                <dt className="eyebrow font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-foreground">
                  {item.value}
                  <AddressCopyButton value={item.copyValue} className="mx-1 inline-flex align-middle" />
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

// Which money moves before and when this transaction signs, in the order a reader
// asks about it: what the network charges, what the protocol holds aside, what the
// wallet holds now, and what is left. Rows exist only for amounts a caller actually
// produced (see `buildPresignCostRows`): a missing deposit or minimum-UTxO figure is
// a row that does not render, never a guessed number.
const COST_ROW_LABEL_KEYS: Record<
  PresignCostRowId,
  "networkFee" | "minimumUtxo" | "deposit" | "refund" | "walletBalance" | "walletBalanceAfterFee"
> = {
  fee: "networkFee",
  minimumUtxo: "minimumUtxo",
  deposit: "deposit",
  refund: "refund",
  balance: "walletBalance",
  balanceAfterFee: "walletBalanceAfterFee"
};

/**
 * What this transaction costs and what the wallet keeps, shown before the sign
 * button. Estimated rows (the fee, and anything derived from it) carry an
 * "estimated" tag; the final charge is fixed by the wallet at signing. Exact rows
 * (the refreshed balance) carry none. Renders nothing when no amount is available,
 * so an unbuilt transaction shows no fake costs.
 */
export function ReviewCosts({ rows }: { rows: PresignCostRow[] }) {
  const i18n = useTranslations("ComponentsUserReviewPanelSections");
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <dl>
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={cn(
              "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1",
              index > 0 && "mt-2"
            )}
          >
            <dt className="eyebrow text-muted-foreground">
              {i18n(COST_ROW_LABEL_KEYS[row.id])}
            </dt>
            <dd className="flex items-baseline gap-1.5 text-sm font-medium text-foreground">
              {formatLovelaceAsAda(row.lovelace)} ₳
              {row.precision === "estimated" ? (
                <span className="eyebrow rounded border border-border/60 px-1">
                  {i18n("estimated")}
                </span>
              ) : null}
            </dd>
            {row.id === "fee" ? (
              <dd className="basis-full text-xs leading-snug text-muted-foreground">
                {i18n("paidToTheCardanoNetworkOnTopOf")}
              </dd>
            ) : null}
            {row.id === "balanceAfterFee" ? (
              <dd className="basis-full text-xs leading-snug text-muted-foreground">
                {i18n("balanceAfterFeeDetail")}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
