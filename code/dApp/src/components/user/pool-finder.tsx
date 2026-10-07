"use client";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef } from "react";


import { CheckCircle2, ExternalLink, Loader2, Search } from "lucide-react";
import { usePoolLookup, usePoolSearch } from "@/lib/query/pools";
import { POOL_SEARCH_QUERY_MAX_LENGTH, PoolIdSchema, type PoolsResponseDto } from "@/lib/api/pools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PoolSearchResults, ada, pct } from "@/components/user/pool-search-results";
import { cn } from "@/lib/utils/cn";
import { CARDANO_NETWORK, POOL_EXPLORER_URLS } from "@/lib/cardano-network";

export type StakePool = PoolsResponseDto["pool"];

// A complete pool id, bech32 `pool1…` or hex, is 56 characters. Anything shorter is a
// prefix and is searched, so `pool1rkfs` lists its matches instead of failing a lookup.
const POOL_ID_LENGTH = 56;

/**
 * "Find your pool": searches pools by ticker, name or id (`/api/v1/pools/search`), and with
 * an empty box lists a random shortlist. Opening a match, or pasting a full pool id, verifies
 * that pool through `/api/v1/pools` and shows the ticker, name, saturation and fees so the
 * reader can confirm they have the right one.
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
  const notReported = i18n("unknown");
  const { query, setQuery, result, loading, failure, lookup } = usePoolLookup();
  // A full pool id goes straight to the exact lookup; anything else searches the index.
  const looksLikePoolId = PoolIdSchema.safeParse(query).success;
  const isPoolId = looksLikePoolId && query.trim().length === POOL_ID_LENGTH;
  const search = usePoolSearch(query, !isPoolId);
  const open = (poolId: string) => {
    setQuery(poolId);
    lookup(poolId);
  };
  const openTop = () => {
    const top = search.pools[0];
    if (top) open(top.poolId);
    // An id-shaped text with no match still gets the server's own answer.
    else if (looksLikePoolId) lookup();
  };
  // Enter on typed text opens the top match for that text. Pressed before those matches
  // arrive, it waits for them: it used to do nothing, with no sign the key was heard.
  // A ref, not state: the wait needs no render of its own, only the search's next answer.
  const enterPending = useRef(false);
  const submit = () => {
    if (isPoolId || !query.trim()) return lookup();
    if (search.fresh) openTop();
    // After a failed search nothing would end the wait, and a later refetch, such as on
    // window focus, would open a pool long after the key press.
    else if (!search.failed) enterPending.current = true;
  };
  const openTopLater = useEffectEvent(openTop);
  useEffect(() => {
    if (!enterPending.current) return;
    // A failed search ends the wait, so a later refetch cannot open a pool unasked.
    if (search.failed) enterPending.current = false;
    if (!search.fresh) return;
    enterPending.current = false;
    openTopLater();
  }, [search.fresh, search.failed]);
  const error = failure?.kind === "empty" ? i18n("typeToSearch")
    : failure?.kind === "response" ? failure.message ?? i18n("poolLookupFailed")
    : failure?.kind === "network" ? i18n("couldnTReachThePoolLookupTryAgain_fb9241")
    : null;

  const shown = result ?? selectedPool;
  const isSelected = shown != null && selectedPool?.poolId === shown.poolId;

  return (
    <div className="space-y-3">
      {/* space-y-2 and gap-3: at space-y-1/gap-2 the input's focus ring reached closer to
          the label, the button and the helper than its own 4px spread. */}
      <div className="space-y-2">
        <Label htmlFor="poolFinderInput">{i18n("findYourPool")}</Label>
        <div className="flex gap-3">
          <Input
            id="poolFinderInput"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              enterPending.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={i18n("searchPlaceholder")}
            // The server rejects a longer search; a pool id is 56 characters.
            maxLength={POOL_SEARCH_QUERY_MAX_LENGTH}
            className="font-mono text-xs"
          />
          <Button type="button" variant="secondary" onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {i18n("lookUp")}
          </Button>
        </div>
        {isPoolId ? null : (
          <PoolSearchResults
            query={search.query}
            pools={search.pools}
            loading={search.loading}
            failed={search.failed}
            onOpen={open}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {i18n.rich("donTHaveOneBrowsePoolsOnPool_b446d3", {
            cardanoscan: (chunks) => (
              <a
                href={POOL_EXPLORER_URLS.cardanoscan}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </a>
            ),
            adastat: (chunks) => (
              <a
                href={POOL_EXPLORER_URLS.adastat}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </a>
            )
          })}
        </p>
        {CARDANO_NETWORK === "mainnet" ? null : (
          <p className="text-xs text-muted-foreground">
            {i18n("testNetworkPoolsNote", { network: CARDANO_NETWORK })}
          </p>
        )}
      </div>

      {error ? (
        // `role="alert"`: the lookup runs on demand and this is its only failure cue.
        // Without it a screen-reader user presses Look up and hears nothing back.
        <p
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
        >
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

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4 [&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere]">
            <div>
              <dt className="eyebrow text-muted-foreground">{i18n("saturation")}</dt>
              <dd
                className={cn(
                  "mt-0.5 font-medium",
                  (shown.saturation ?? 0) >= 1 ? "text-amber-300" : "text-foreground"
                )}
              >
                {pct(shown.saturation, notReported)}
                {(shown.saturation ?? 0) >= 1 ? (
                  <span className="block">{i18n("overCapacity")}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">{i18n("liveStake")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{ada(shown.liveStakeLovelace, notReported)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">{i18n("margin")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{pct(shown.marginPct, notReported)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">{i18n("fixedFee")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{ada(shown.fixedCostLovelace, notReported)}</dd>
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
