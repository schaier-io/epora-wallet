"use client";

import { keepPreviousData, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { PoolSearchResponseSchema, PoolsResponseSchema } from "@/lib/api/pools";
import { parseRetryAfterMs } from "@/lib/mesh/server-fetcher";
import { queryKeys } from "./keys";

class PoolLookupError extends Error {
  constructor(readonly status: number, readonly serverMessage: string | null, readonly retryAfterMs?: number) {
    super(serverMessage ?? "Pool lookup failed.");
    this.name = "PoolLookupError";
  }
}

async function fetchPools<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    signal.throwIfAborted();
    throw new PoolLookupError(response.ok ? 502 : response.status, null, retryAfterMs);
  }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error : null;
    throw new PoolLookupError(response.status, message, retryAfterMs);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new PoolLookupError(502, null);
  return parsed.data;
}

export const poolQueryOptions = (id: string) => queryOptions({
  queryKey: queryKeys.pool(id),
  queryFn: async ({ signal }) =>
    (await fetchPools(`/api/v1/pools?id=${encodeURIComponent(id)}`, PoolsResponseSchema, signal)).pool
});

/** Typing pauses this long before a search request, so each keystroke does not cost one. */
export const POOL_SEARCH_DEBOUNCE_MS = 250;

export const poolSearchQueryOptions = (query: string) => queryOptions({
  queryKey: queryKeys.poolSearch(query),
  queryFn: async ({ signal }) =>
    (await fetchPools(`/api/v1/pools/search?q=${encodeURIComponent(query)}`, PoolSearchResponseSchema, signal)).pools,
  // The empty query is a random shortlist. Keep one sample for the session, so the list
  // does not reshuffle under the reader's cursor on every refetch.
  ...(query ? {} : { staleTime: Infinity }),
  // A search answers typing. Retrying a 429 waits its Retry-After, 30 s or more, twice,
  // and hid the failure behind a spinner for a minute. The reader can type again instead.
  retry: false
});

/** Matches for the typed text, or the shortlist when it is empty. Off while `enabled` is false. */
export function usePoolSearch(text: string, enabled: boolean) {
  const query = text.trim();
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), POOL_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useQuery({ ...poolSearchQueryOptions(debounced), enabled, placeholderData: keepPreviousData });
  return {
    query: debounced,
    pools: search.data ?? [],
    loading: search.isFetching || debounced !== query,
    // `keepPreviousData` keeps the last list on screen while the next one loads. Only a
    // fresh list may answer Enter, or Enter opens a match for the old text.
    fresh: debounced === query && !search.isPlaceholderData && search.isSuccess,
    // Like `fresh`, a failure answers only the text it searched. During the debounce for
    // new text it belonged to the old text, and dropped an Enter meant for the new one.
    failed: debounced === query && !search.isFetching && search.isError
  };
}

type LookupFailure = { kind: "empty" | "network" } | { kind: "response"; message: string | null };

/** Only the search text and validation state are local; the response belongs to Query. */
export function usePoolLookup() {
  const client = useQueryClient();
  const [query, setQueryText] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [missingId, setMissingId] = useState(false);
  const pool = useQuery({ ...poolQueryOptions(lookupId), enabled: !!lookupId });
  // Typing dismisses the "type something" hint; it answered the previous, empty text.
  const setQuery = (text: string) => {
    setQueryText(text);
    setMissingId(false);
  };
  const lookup = (id = query.trim()) => {
    // Drop only a repeat of the lookup in flight. A different id replaces it, or a second
    // row clicked before the first answered showed the first pool under the second's id.
    if (pool.isFetching && id === lookupId) return;
    setMissingId(!id);
    if (!id) return;
    if (id === lookupId) {
      // fetchQuery reuses fresh data and retries failed entries. Query deduplicates Enter/button requests.
      void client.fetchQuery(poolQueryOptions(id)).catch(() => undefined);
    } else {
      setLookupId(id);
    }
  };
  // A lookup error belongs to the id it looked up; once the text moves on, it is stale.
  const failure: LookupFailure | null = missingId ? { kind: "empty" }
    : pool.isFetching || !pool.error || query.trim() !== lookupId ? null
    : pool.error instanceof PoolLookupError ? { kind: "response", message: pool.error.serverMessage }
    : { kind: "network" };
  return { query, setQuery, result: pool.data ?? null, loading: pool.isFetching, failure, lookup };
}
