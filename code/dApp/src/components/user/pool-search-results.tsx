"use client";
import { useTranslations } from "next-intl";

import { Loader2 } from "lucide-react";
import type { PoolSummary } from "@/lib/api/pools";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { cn } from "@/lib/utils/cn";

export function pct(value: number | null, notReported: string): string {
  return value == null ? notReported : `${(value * 100).toFixed(1)}%`;
}

export function ada(lovelace: string | null, notReported: string): string {
  return lovelace == null ? notReported : `${formatLovelaceAsAda(lovelace)} ₳`;
}

/**
 * The pools under the finder's input: matches for the typed text, or, when the input is
 * empty, the server's random shortlist. A row only opens the pool's card; picking still
 * happens on the card, so a stray click here picks nothing.
 */
export function PoolSearchResults({
  query,
  pools,
  loading,
  failed,
  onOpen
}: {
  query: string;
  pools: PoolSummary[];
  loading: boolean;
  failed: boolean;
  onOpen: (poolId: string) => void;
}) {
  const i18n = useTranslations("ComponentsUserPoolSearchResults");
  const notReported = i18n("unknown");

  return (
    <div className="space-y-2" aria-busy={loading}>
      {query ? null : (
        <p className="text-xs text-muted-foreground">{i18n("shortlistNote")}</p>
      )}
      {failed ? (
        <p role="alert" className="text-xs text-amber-100">{i18n("listFailed")}</p>
      ) : pools.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {loading ? i18n("loading") : query ? i18n("noMatch", { query }) : i18n("noShortlist")}
        </p>
      ) : (
        // Dimmed while the next list loads: the rows still answer the previous text.
        <ul
          className={cn(
            "divide-y divide-border/60 rounded-md border border-border/60 transition-opacity",
            loading && "opacity-60"
          )}
        >
          {pools.map((pool) => (
            <li key={pool.poolId}>
              <button
                type="button"
                onClick={() => onOpen(pool.poolId)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-foreground">
                      {pool.ticker ? i18n("ticker", { ticker: pool.ticker }) : i18n("noTicker")}
                    </span>
                    {pool.retiring ? (
                      <span className="eyebrow text-amber-100">{i18n("retiring")}</span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {pool.name ?? pool.poolId}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block">
                    {i18n("saturationValue", { value: pct(pool.saturation, notReported) })}
                  </span>
                  <span className="block">
                    {i18n("feesValue", {
                      margin: pct(pool.marginPct, notReported),
                      fixed: ada(pool.fixedCostLovelace, notReported)
                    })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
