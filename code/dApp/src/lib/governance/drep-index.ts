import type { DrepSummary } from "@/lib/api/dreps";

// A searchable copy of every registered DRep, so the voting-delegate form can find one
// by name. Blockfrost has no DRep name search and serves each name with its own request.
// Koios lists every registered DRep id, then returns status and CIP-119 metadata for a
// batch of ids per request. Mainnet has about a thousand registered DReps, so one build
// costs about thirty requests; the cache below pays that once per TTL per server instance.

/** One Koios request: a GET without `body`, a POST of `body` as JSON with it. */
export type KoiosCall = (path: string, body?: unknown) => Promise<unknown>;

/** Koios answered with an error status; `retryAfter` is its `Retry-After`, when sent. */
export class KoiosDrepsError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null) {
    super(`Koios DRep request failed (${status}).`);
    this.name = "KoiosDrepsError";
  }
}

// Koios answers at most this many rows per request (Koios API spec, "Pagination").
export const KOIOS_PAGE_ROWS = 1000;
// 20,000 DReps. A bound on the loop, far above any network's DRep count.
const MAX_PAGES = 20;
// Koios refuses a request body over 5 KB with a 413. A CIP-129 id is 58 characters,
// about 61 bytes as a JSON string, so 64 ids stay near 4 KB. Measured on mainnet
// 2026-10-07: 75 ids answered 200, 99 answered 413.
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

const LIST_PATH = "/drep_list?registered=eq.true&select=drep_id&order=drep_id.asc";
const INFO_PATH = "/drep_info?select=drep_id,drep_status,active,amount,has_script";
const METADATA_PATH = "/drep_metadata?select=drep_id,name:meta_json->body->givenName";

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

async function listRegisteredIds(call: KoiosCall): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = rowsOf(await call(`${LIST_PATH}&offset=${page * KOIOS_PAGE_ROWS}`));
    ids.push(...rows.flatMap((row) => text(row.drep_id) ?? []));
    if (rows.length < KOIOS_PAGE_ROWS) break;
  }
  return ids;
}

/** `path` called once per batch of ids, `BATCH_CONCURRENCY` batches at a time. */
async function postInBatches(call: KoiosCall, path: string, ids: string[]): Promise<Row[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += DREP_BATCH_SIZE) batches.push(ids.slice(i, i + DREP_BATCH_SIZE));
  const rows: Row[] = [];
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const answers = await Promise.all(
      batches.slice(i, i + BATCH_CONCURRENCY).map((batch) => call(path, { _drep_ids: batch }))
    );
    for (const answer of answers) rows.push(...rowsOf(answer));
  }
  return rows;
}

export async function buildDrepIndex(call: KoiosCall): Promise<DrepIndexEntry[]> {
  const ids = await listRegisteredIds(call);
  // Sequential, not parallel: both walks share one upstream budget.
  const info = await postInBatches(call, INFO_PATH, ids);
  const metadata = await postInBatches(call, METADATA_PATH, ids);
  const names = new Map(metadata.flatMap((row) => {
    const id = text(row.drep_id);
    return id ? [[id, givenName(row.name)] as const] : [];
  }));
  return info.flatMap((row) => {
    const drepId = text(row.drep_id);
    // The list and the info call are not one snapshot: a DRep can retire in between.
    if (!drepId || row.drep_status !== "registered") return [];
    return [{
      drepId,
      name: names.get(drepId) ?? null,
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
  const name = entry.name?.toLowerCase() ?? "";
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
    // then named ones, then by name.
    .sort(
      (a, b) =>
        a.score - b.score ||
        Number(a.entry.status !== "active") - Number(b.entry.status !== "active") ||
        Number(a.entry.name == null) - Number(b.entry.name == null) ||
        (a.entry.name ?? "").localeCompare(b.entry.name ?? "")
    )
    .slice(0, DREP_SEARCH_LIMIT)
    .map(({ entry }) => entry);
}

/**
 * A random sample of active DReps that publish a name. Random, not ranked, so the app
 * neither endorses a DRep nor steers every delegator to the same few.
 */
export function shortlistDreps(entries: DrepIndexEntry[], random = Math.random): DrepIndexEntry[] {
  const picked = entries.filter((entry) => entry.status === "active" && entry.name != null);
  // Partial Fisher-Yates: shuffle only the slots we return.
  const size = Math.min(DREP_SHORTLIST_SIZE, picked.length);
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (picked.length - i));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.slice(0, size);
}
