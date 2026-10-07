import type { DrepSummary } from "@/lib/api/dreps";

// A searchable copy of every registered DRep that publishes a CIP-119 name, so the
// voting-delegate form can find one by name. Blockfrost has no DRep name search and serves
// each name with its own request. Koios lists every DRep update with its metadata, which
// names the DReps in a few pages; status and voting power then come in batches of ids.
// One mainnet build costs about fifteen requests; the cache below pays that once per TTL
// per server instance. A DRep without a name is not listed: the form finds it by its id.

/** One Koios request: a GET without `body`, a POST of `body` as JSON with it. */
export type KoiosCall = (path: string, body?: unknown) => Promise<unknown>;

/**
 * Koios failed: an error status, with its `Retry-After` when sent, or `status` 0 when it
 * could not be reached in time or answered with a body that is not JSON.
 */
export class KoiosDrepsError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null, options?: ErrorOptions) {
    super(status ? `Koios DRep request failed (${status}).` : "Koios DRep request failed.", options);
    this.name = "KoiosDrepsError";
  }
}

// Koios answers at most this many rows per request (Koios API spec, "Pagination").
export const KOIOS_PAGE_ROWS = 1000;
// 50,000 named updates per walk. A bound on the loop, far above any network's count
// (preview had 2,644 on 2026-10-07).
const MAX_PAGES = 50;
// Koios's servers do not hold the same metadata: on 2026-10-07 one mainnet server had 428
// documents where the others had 984 to 990, while every server had the same 3,589
// updates. Each request may reach any of them, so the names are read this many times
// and merged. A name is a fact about one anchor document, so any server's copy is right.
export const NAME_WALKS = 3;
// Koios refuses a large request body with a 413. Its spec allows 1 KB on the public tier
// and 5 KB on registered tiers, but the public mainnet API took 75 ids (about 4.6 KB) and
// refused 99 on 2026-10-07. A CIP-129 id is about 61 bytes as a JSON string, so 64 ids
// stay near 4 KB; a batch that still meets a 413 is split in half and sent again.
export const DREP_BATCH_SIZE = 64;
// Batches requested at once, so a build does not burst into the public tier's limit.
const BATCH_CONCURRENCY = 4;
const DREP_ID_BECH32_PREFIX = "drep1";
export const DREP_INDEX_TTL_MS = 6 * 60 * 60 * 1000;
// After a failed build, wait this long before the next one, so searches during a Koios
// 429 do not each start another thirty upstream requests.
export const DREP_INDEX_RETRY_MS = 30 * 1000;
export const DREP_SEARCH_LIMIT = 20;
export const DREP_SHORTLIST_SIZE = 6;

// Only updates whose anchor names the DRep, oldest first. Pages continue from the last
// `block_time` read, not from an offset: servers hold different rows, so an offset taken
// on one server skips rows on another. Koios orders only by selected columns.
const NAMED_UPDATES_PATH = "/drep_updates?select=drep_id,meta_hash,block_time,name:meta_json->body->givenName" +
  "&meta_json->body->givenName=not.is.null&order=block_time.asc";
const INFO_PATH = "/drep_info?select=drep_id,drep_status,active,amount,has_script,meta_hash";

export type DrepIndexEntry = DrepSummary;

type Row = Record<string, unknown>;

const asRecord = (value: unknown): Row | null =>
  typeof value === "object" && value !== null ? (value as Row) : null;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** CIP-119 `givenName`: a string, or JSON-LD `{ "@value": … }` from some publishers. */
function givenName(value: unknown): string | null {
  return text(value) ?? text(asRecord(value)?.["@value"]);
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.flatMap((row) => asRecord(row) ?? []) as Row[] : [];
}

const anchorKey = (drepId: string, metaHash: string) => `${drepId} ${metaHash}`;

/** Adds every named anchor one walk finds to `names`, keyed by DRep and anchor hash. */
async function walkNamedAnchors(call: KoiosCall, names: Map<string, string>, drepIds: Set<string>) {
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    // `gte`, not `gt`: the last block may continue on the next page. Its rows repeat, and
    // the map drops the repeats.
    const rows = rowsOf(await call(`${NAMED_UPDATES_PATH}&block_time=gte.${from}`));
    for (const row of rows) {
      const drepId = text(row.drep_id);
      const metaHash = text(row.meta_hash);
      const name = givenName(row.name);
      if (!drepId || !metaHash || !name) continue;
      names.set(anchorKey(drepId, metaHash), name);
      drepIds.add(drepId);
    }
    const last = Number(rows.at(-1)?.block_time);
    // A full page that did not move past `from` would ask for itself forever.
    if (rows.length < KOIOS_PAGE_ROWS || !(last > from)) break;
    from = last;
  }
}

/** One batch, split in half for as long as Koios answers that the body is too large. */
async function postBatch(call: KoiosCall, path: string, ids: string[]): Promise<Row[]> {
  try {
    return rowsOf(await call(path, { _drep_ids: ids }));
  } catch (error) {
    if (!(error instanceof KoiosDrepsError && error.status === 413) || ids.length < 2) throw error;
    const half = Math.ceil(ids.length / 2);
    return [...await postBatch(call, path, ids.slice(0, half)), ...await postBatch(call, path, ids.slice(half))];
  }
}

/** `path` called once per batch of ids, `BATCH_CONCURRENCY` batches at a time. */
async function postInBatches(call: KoiosCall, path: string, ids: string[]): Promise<Row[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += DREP_BATCH_SIZE) batches.push(ids.slice(i, i + DREP_BATCH_SIZE));
  const rows: Row[] = [];
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const answers = await Promise.all(
      batches.slice(i, i + BATCH_CONCURRENCY).map((batch) => postBatch(call, path, batch))
    );
    for (const answer of answers) rows.push(...answer);
  }
  return rows;
}

export async function buildDrepIndex(call: KoiosCall): Promise<DrepIndexEntry[]> {
  const names = new Map<string, string>();
  const drepIds = new Set<string>();
  // Sequential: each walk is a few requests, and they share one upstream budget.
  for (let walk = 0; walk < NAME_WALKS; walk++) await walkNamedAnchors(call, names, drepIds);
  const info = await postInBatches(call, INFO_PATH, [...drepIds]);
  return info.flatMap((row) => {
    const drepId = text(row.drep_id);
    const metaHash = text(row.meta_hash);
    // The name of the DRep's current anchor only. A retired DRep drops out, and so does
    // one whose current anchor has no name: an older anchor's name no longer holds.
    const name = drepId && metaHash ? names.get(anchorKey(drepId, metaHash)) : undefined;
    if (!drepId || !name || row.drep_status !== "registered") return [];
    return [{
      drepId,
      name,
      votingPowerLovelace: typeof row.amount === "string" && /^\d+$/.test(row.amount) ? row.amount : null,
      hasScript: row.has_script === true,
      status: row.active === true ? "active" : "inactive"
    }];
  });
}

let cached: { entries: DrepIndexEntry[]; expiresAt: number } | null = null;
let inflight: Promise<DrepIndexEntry[]> | null = null;
let failure: { error: unknown; retryAt: number } | null = null;

/** A failed build waiting out its backoff. Carries the build's error and the time left. */
export class DrepIndexBackoffError extends Error {
  constructor(cause: unknown, readonly retryAfterSeconds: number) {
    super("The DRep index is waiting before it rebuilds.", { cause });
    this.name = "DrepIndexBackoffError";
  }
}

/**
 * The cached index, on the same rules as the pool index (`lib/pools/pool-index.ts`):
 * concurrent callers share one build, an expired index is served while it rebuilds and
 * after a failed rebuild, and a failed build is not retried for `DREP_INDEX_RETRY_MS`
 * or the `Retry-After` Koios sent, whichever is longer.
 */
export function getDrepIndex(call: KoiosCall, now = Date.now()): Promise<DrepIndexEntry[]> {
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.entries);
  if (!inflight && (!failure || failure.retryAt <= now)) {
    // `now` is a parameter for the tests; real time is the later of the two.
    const settledAt = () => Math.max(now, Date.now());
    inflight = buildDrepIndex(call)
      .then(
        (entries) => {
          cached = { entries, expiresAt: settledAt() + DREP_INDEX_TTL_MS };
          failure = null;
          return entries;
        },
        (error: unknown) => {
          const providerWaitMs = error instanceof KoiosDrepsError && error.status === 429
            ? (Number(error.retryAfter) || 0) * 1000
            : 0;
          failure = { error, retryAt: settledAt() + Math.max(DREP_INDEX_RETRY_MS, providerWaitMs) };
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
    new DrepIndexBackoffError(failure?.error, Math.max(1, Math.ceil((retryAt - now) / 1000)))
  );
}

export function resetDrepIndexForTests() {
  cached = null;
  inflight = null;
  failure = null;
}

function rank(entry: DrepIndexEntry, query: string): number | null {
  const name = entry.name.toLowerCase();
  // Every id starts with "drep1", so an id prefix only counts once the query goes past it.
  const idPrefix = query.length > DREP_ID_BECH32_PREFIX.length && entry.drepId.startsWith(query);
  if (name.startsWith(query) || idPrefix) return 0;
  if (name.includes(query)) return 1;
  return null;
}

/** DReps whose name or bech32 id matches, best match first. */
export function searchDreps(entries: DrepIndexEntry[], rawQuery: string): DrepIndexEntry[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  return entries
    .flatMap((entry) => {
      const score = rank(entry, query);
      return score == null ? [] : [{ entry, score }];
    })
    // Within a rank, active DReps come first (an inactive DRep's power does not count),
    // then by name.
    .sort(
      (a, b) =>
        a.score - b.score ||
        Number(a.entry.status !== "active") - Number(b.entry.status !== "active") ||
        a.entry.name.localeCompare(b.entry.name)
    )
    .slice(0, DREP_SEARCH_LIMIT)
    .map(({ entry }) => entry);
}

/**
 * A random sample of active DReps (every listed DRep publishes a name). Random, not
 * ranked, so the app neither endorses a DRep nor steers every delegator to the same few.
 */
export function shortlistDreps(entries: DrepIndexEntry[], random = Math.random): DrepIndexEntry[] {
  const picked = entries.filter((entry) => entry.status === "active");
  // Partial Fisher-Yates: shuffle only the slots we return.
  const size = Math.min(DREP_SHORTLIST_SIZE, picked.length);
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (picked.length - i));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.slice(0, size);
}
