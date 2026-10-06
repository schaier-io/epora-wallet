import { meshHttpStatus } from "@/lib/mesh/http-error";
import type { PoolSummary } from "@/lib/api/pools";

// A searchable copy of every registered pool, so the finder can resolve a ticker or
// a name. Blockfrost has no search endpoint, but `/pools/extended` lists every pool
// with its ticker and name, 100 per page. Mainnet has a few thousand pools, so one
// build costs a few dozen requests; the cache below pays that once per TTL per
// server instance, not once per keystroke.

type Get = (path: string) => Promise<unknown>;

export const POOL_PAGE_SIZE = 100;
const POOL_ID_BECH32_PREFIX = "pool1";
// Pages fetched at once. Blockfrost allows 10 requests per second with a burst
// allowance, so one batch stays inside the burst.
const PAGE_CONCURRENCY = 10;
// 10,000 pools. A bound on the loop, far above any network's pool count.
const MAX_PAGES = 100;
export const POOL_INDEX_TTL_MS = 6 * 60 * 60 * 1000;
// After a failed build, wait this long before the next one. Without it, every search
// during a Blockfrost 429 started another twenty upstream requests on the shared key.
export const POOL_INDEX_RETRY_MS = 30 * 1000;
export const POOL_SEARCH_LIMIT = 20;
export const POOL_SHORTLIST_SIZE = 6;
// The shortlist leaves out pools close to saturation, where new stake earns less.
export const POOL_SHORTLIST_MAX_SATURATION = 0.9;
// It also leaves out pools that keep most rewards for themselves. Preprod lists pools at
// a 100% margin, which pay their delegators nothing.
export const POOL_SHORTLIST_MAX_MARGIN = 0.1;

type RawExtendedPool = {
  pool_id?: unknown;
  live_stake?: unknown;
  live_saturation?: unknown;
  margin_cost?: unknown;
  fixed_cost?: unknown;
  metadata?: { ticker?: unknown; name?: unknown } | null;
};

export type PoolIndexEntry = PoolSummary;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// A 404 on a list page means "no rows", not a failure.
async function getPage(get: Get, path: string): Promise<unknown[]> {
  try {
    const page = await get(path);
    return Array.isArray(page) ? (page as unknown[]) : [];
  } catch (error) {
    if (meshHttpStatus(error) === 404) return [];
    throw error;
  }
}

/** Every page of a Blockfrost list endpoint, fetched in parallel batches. */
async function getAllPages(get: Get, path: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let first = 1; first <= MAX_PAGES; first += PAGE_CONCURRENCY) {
    const pages = await Promise.all(
      Array.from({ length: PAGE_CONCURRENCY }, (_, offset) =>
        getPage(get, `${path}?count=${POOL_PAGE_SIZE}&page=${first + offset}`)
      )
    );
    for (const page of pages) rows.push(...page);
    if (pages.some((page) => page.length < POOL_PAGE_SIZE)) break;
  }
  return rows;
}

export async function buildPoolIndex(get: Get): Promise<PoolIndexEntry[]> {
  const [pools, retiring] = await Promise.all([
    getAllPages(get, "/pools/extended"),
    getAllPages(get, "/pools/retiring")
  ]);
  const retiringIds = new Set(
    retiring.map((row) => text((row as { pool_id?: unknown } | null)?.pool_id)).filter(Boolean)
  );
  return pools.flatMap((row) => {
    const pool = (row ?? {}) as RawExtendedPool;
    const poolId = text(pool.pool_id);
    if (!poolId) return [];
    return [{
      poolId,
      ticker: text(pool.metadata?.ticker),
      name: text(pool.metadata?.name),
      saturation: num(pool.live_saturation),
      liveStakeLovelace: text(pool.live_stake),
      marginPct: num(pool.margin_cost),
      fixedCostLovelace: text(pool.fixed_cost),
      retiring: retiringIds.has(poolId)
    }];
  });
}

let cached: { entries: PoolIndexEntry[]; expiresAt: number } | null = null;
let inflight: Promise<PoolIndexEntry[]> | null = null;
let failure: { error: unknown; retryAt: number } | null = null;

/** A failed build waiting out its backoff. Carries the build's error and the time left. */
export class PoolIndexBackoffError extends Error {
  constructor(cause: unknown, readonly retryAfterSeconds: number) {
    super("The pool index is waiting before it rebuilds.", { cause });
    this.name = "PoolIndexBackoffError";
  }
}

/**
 * The cached index. Concurrent callers share one build. An expired index is still
 * served while its rebuild runs, and after a failed rebuild. A failed build is not
 * cached and is not retried for `POOL_INDEX_RETRY_MS`; until then a caller with no
 * index gets a `PoolIndexBackoffError`. The TTL and the backoff run from when the build
 * ends, so a build that hangs for longer than the backoff still waits it out.
 */
export function getPoolIndex(get: Get, now = Date.now()): Promise<PoolIndexEntry[]> {
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.entries);
  if (!inflight && (!failure || failure.retryAt <= now)) {
    // `now` is a parameter for the tests; real time is the later of the two.
    const settledAt = () => Math.max(now, Date.now());
    inflight = buildPoolIndex(get)
      .then(
        (entries) => {
          cached = { entries, expiresAt: settledAt() + POOL_INDEX_TTL_MS };
          failure = null;
          return entries;
        },
        (error: unknown) => {
          failure = { error, retryAt: settledAt() + POOL_INDEX_RETRY_MS };
          throw error;
        }
      )
      .finally(() => {
        inflight = null;
      });
    // A caller served the stale index never awaits this build; keep its failure handled.
    inflight.catch(() => undefined);
  }
  if (cached) return Promise.resolve(cached.entries);
  if (inflight) return inflight;
  const retryAt = failure?.retryAt ?? now;
  return Promise.reject(
    new PoolIndexBackoffError(failure?.error, Math.max(1, Math.ceil((retryAt - now) / 1000)))
  );
}

export function resetPoolIndexForTests() {
  cached = null;
  inflight = null;
  failure = null;
}

function rank(entry: PoolIndexEntry, query: string): number | null {
  const ticker = entry.ticker?.toLowerCase() ?? "";
  const name = entry.name?.toLowerCase() ?? "";
  // Every bech32 id starts with "pool1", so an id prefix only counts once the query
  // goes past it. Otherwise "pool" matched every pool, ahead of a ticker named POOL.
  const idPrefix = query.length > POOL_ID_BECH32_PREFIX.length && entry.poolId.startsWith(query);
  // An exact ticker needs no rank of its own: it sorts first among the prefix matches.
  if (ticker.startsWith(query) || idPrefix) return 0;
  if (name.startsWith(query)) return 1;
  if (ticker.includes(query) || name.includes(query)) return 2;
  return null;
}

/** Pools whose ticker, name or bech32 id matches, best match first. */
export function searchPools(entries: PoolIndexEntry[], rawQuery: string): PoolIndexEntry[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  return entries
    .flatMap((entry) => {
      const score = rank(entry, query);
      return score == null ? [] : [{ entry, score }];
    })
    // Within a rank, pools with a ticker come first, then by ticker.
    .sort(
      (a, b) =>
        a.score - b.score ||
        Number(a.entry.ticker == null) - Number(b.entry.ticker == null) ||
        (a.entry.ticker ?? "").localeCompare(b.entry.ticker ?? "")
    )
    .slice(0, POOL_SEARCH_LIMIT)
    .map(({ entry }) => entry);
}

/**
 * A random sample of pools a delegator could pick: they publish a ticker, are not
 * retiring, have live stake, have room before saturation, and keep at most a 10%
 * margin. Random, not ranked, so the app neither endorses a pool nor steers everyone
 * to the same few.
 */
export function shortlistPools(entries: PoolIndexEntry[], random = Math.random): PoolIndexEntry[] {
  const eligible = entries.filter(
    (entry) =>
      entry.ticker != null &&
      !entry.retiring &&
      entry.saturation != null &&
      entry.saturation > 0 &&
      entry.saturation < POOL_SHORTLIST_MAX_SATURATION &&
      entry.marginPct != null &&
      entry.marginPct <= POOL_SHORTLIST_MAX_MARGIN
  );
  // Partial Fisher-Yates: shuffle only the slots we return.
  const picked = [...eligible];
  const size = Math.min(POOL_SHORTLIST_SIZE, picked.length);
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (picked.length - i));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.slice(0, size);
}
