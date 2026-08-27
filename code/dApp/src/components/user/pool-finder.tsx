"use client";
import { useTranslations } from "next-intl";


import { CheckCircle2, ExternalLink, Loader2, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import { cn } from "@/lib/utils/cn";

export type StakePool = {
  poolId: string;
  ticker: string | null;
  name: string | null;
  homepage: string | null;
  description: string | null;
  saturation: number | null;
  liveStakeLovelace: string | null;
  activeStakeLovelace: string | null;
  declaredPledgeLovelace: string | null;
  livePledgeLovelace: string | null;
  marginPct: number | null;
  fixedCostLovelace: string | null;
  blocksMinted: number | null;
  retiring: boolean;
};

function pct(value: number | null, unavailable: string): string {
  return value == null ? unavailable : `${(value * 100).toFixed(1)}%`;
}

function ada(lovelace: string | null, unavailable: string): string {
  return lovelace == null ? unavailable : `${formatLovelaceAsAda(lovelace)} ₳`;
}

/**
 * "Find your pool" — verifies a stake pool by id via the server-side Blockfrost
 * route (`/api/pools`) and lets the user select it to delegate to. Blockfrost
 * has no ticker search, so the user pastes the pool id (`pool1…`) from any pool
 * explorer; we look up and show the ticker/name/saturation/fees to confirm.
 */
export function PoolFinder({
  selectedPool,
  onSelect
}: {
  selectedPool: StakePool | null;
  onSelect: (pool: StakePool | null) => void;
}) {
  const i18n = useTranslations("ComponentsUserPoolFinder");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<StakePool | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const id = query.trim();
    if (!id) {
      setError(i18n("pasteAPoolIdPool1ToLookIt"));
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/pools?id=${encodeURIComponent(id)}`);
      const data = (await response.json()) as { pool?: StakePool; error?: string };
      if (!response.ok || !data.pool) {
        setError(data.error ?? i18n("poolLookupFailed"));
        return;
      }
      setResult(data.pool);
    } catch {
      setError(i18n("couldnTReachThePoolLookupTryAgain"));
    } finally {
      setLoading(false);
    }
  }, [i18n, query]);

  const shown = result ?? selectedPool;
  const isSelected = shown != null && selectedPool?.poolId === shown.poolId;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="poolFinderInput">{i18n("findYourPool")}</Label>
        <div className="flex gap-2">
          <Input
            id="poolFinderInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void lookup();
              }
            }}
            placeholder={i18n("pool1PasteFromAnyPoolExplorer")}
            className="font-mono text-xs"
          />
          <Button type="button" variant="secondary" onClick={() => void lookup()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {i18n("lookUp")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {i18n("donTHaveOneBrowsePoolsOnPool")}
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {error}
        </p>
      ) : null}

      {shown ? (
        <div
          className={cn(
            "rounded-xl border bg-background/40 p-4 transition-colors",
            isSelected ? "border-emerald-400/50 bg-emerald-500/10" : "border-border/60"
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {shown.ticker ? i18n("value1", { value1: shown.ticker }) : i18n("stakePool")}
                {shown.name ? <span className="truncate text-muted-foreground">{shown.name}</span> : null}
                {shown.retiring ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-100">
                    {i18n("retiring")}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{shown.poolId}</p>
            </div>
            {shown.homepage ? (
              <a
                href={shown.homepage}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {i18n("website")} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{i18n("saturation")}</dt>
              <dd
                className={cn(
                  "mt-0.5 font-medium",
                  (shown.saturation ?? 0) >= 1 ? "text-amber-300" : "text-foreground"
                )}
              >
                {pct(shown.saturation, i18n("notAvailable"))}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{i18n("liveStake")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{ada(shown.liveStakeLovelace, i18n("notAvailable"))}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{i18n("margin")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{pct(shown.marginPct, i18n("notAvailable"))}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{i18n("fixedFee")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{ada(shown.fixedCostLovelace, i18n("notAvailable"))}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            {isSelected ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100">
                  <CheckCircle2 className="h-4 w-4" /> {i18n("selectedToDelegate")}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
                  {i18n("clear")}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => onSelect(shown)} disabled={shown.retiring}>
                {i18n("delegateToThisPool")}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
