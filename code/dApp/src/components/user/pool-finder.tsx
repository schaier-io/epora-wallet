"use client";
import { useTranslations } from "next-intl";


import { CheckCircle2, ExternalLink, Loader2, Search } from "lucide-react";
import { useCallback, useState, useRef } from "react";
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

// A blank cell used to be an em dash, which reads as a value rather than a gap. The pool
// lookup returns null when the chain data does not carry the figure, and that is what the
// cell should say.
const NOT_REPORTED = "Unknown";

function pct(value: number | null): string {
  return value == null ? NOT_REPORTED : `${(value * 100).toFixed(1)}%`;
}

function ada(lovelace: string | null): string {
  return lovelace == null ? NOT_REPORTED : `${formatLovelaceAsAda(lovelace)} ₳`;
}

/**
 * "Find your pool": verifies a stake pool by id through the server-side Blockfrost route
 * (`/api/v1/pools`) and shows the ticker, name, saturation and fees so the reader can confirm
 * they have the right one. Blockfrost has no ticker search, so the pool id is pasted from
 * any pool explorer.
 *
 * Picking a pool marks it on screen and does nothing else. `selectedStakePoolAtom`
 * (`workspace/atoms/forms/withdraw-form.atoms.ts:9`) is written only from here and read
 * only by the screen that renders this component, to pass the value straight back as
 * `selectedPool`. No builder, validation or receipt reads it, and the app has no
 * delegation transaction, so the controls below say "pick", not "delegate".
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

  // Enter and the button both call this; a ref blocks the second call before
  // React has re-rendered the button as disabled.
  const inFlightRef = useRef(false);

  const lookup = useCallback(async () => {
    if (inFlightRef.current) return;
    const id = query.trim();
    if (!id) {
      setError(i18n("pasteAPoolIdPool1ToLookIt"));
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/v1/pools?id=${encodeURIComponent(id)}`);
      const data = (await response.json()) as { pool?: StakePool; error?: string };
      if (!response.ok || !data.pool) {
        setError(data.error ?? i18n("poolLookupFailed"));
        return;
      }
      setResult(data.pool);
    } catch {
      setError(i18n("couldnTReachThePoolLookupTryAgain_fb9241"));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [query, i18n]);

  const shown = result ?? selectedPool;
  const isSelected = shown != null && selectedPool?.poolId === shown.poolId;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
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
            placeholder={i18n("pool1")}
            className="font-mono text-xs"
          />
          <Button type="button" variant="secondary" onClick={() => void lookup()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {i18n("lookUp")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {i18n.rich("donTHaveOneBrowsePoolsOnPool_b446d3", {
            poolPm: (chunks) => (
              <a
                href="https://pool.pm/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </a>
            ),
            cexplorer: (chunks) => (
              <a
                href="https://cexplorer.io/pool"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </a>
            )
          })}
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
            // rounded-md and p-2, one rung in from the rounded-lg panel this sits inside
            // (`config-setintendedstakecredential-view.tsx:65`). It used to be rounded-xl,
            // a wider radius than its own parent.
            "rounded-md border bg-background/40 p-2 sm:p-3 transition-colors",
            isSelected ? "border-emerald-400/50 bg-emerald-500/10" : "border-border/60"
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {shown.ticker ? i18n("value1", { value1: shown.ticker }) : i18n("stakePool")}
                {shown.name ? <span className="truncate text-muted-foreground">{shown.name}</span> : null}
                {shown.retiring ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 eyebrow text-amber-100">
                    {i18n("retiring")}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{shown.poolId}</p>
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
              <dt className="eyebrow text-muted-foreground">{i18n("saturation")}</dt>
              <dd
                className={cn(
                  "mt-0.5 font-medium",
                  (shown.saturation ?? 0) >= 1 ? "text-amber-300" : "text-foreground"
                )}
              >
                {pct(shown.saturation)}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">{i18n("liveStake")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{ada(shown.liveStakeLovelace)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">{i18n("margin")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{pct(shown.marginPct)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">{i18n("fixedFee")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{ada(shown.fixedCostLovelace)}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            {isSelected ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100">
                  <CheckCircle2 className="h-4 w-4" /> {i18n("picked")}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
                  {i18n("clear")}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => onSelect(shown)} disabled={shown.retiring}>
                {/* The button was disabled for a retiring pool with nothing to say why. The
                    label carries the reason, so the greyed-out state explains itself. */}
                {shown.retiring ? i18n("thisPoolIsClosing") : i18n("pickThisPool")}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
