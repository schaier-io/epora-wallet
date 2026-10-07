"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { DrepSearchResponseSchema, DrepsResponseSchema, extractDrepId } from "@/lib/api/dreps";
import { parseRetryAfterMs } from "@/lib/mesh/server-fetcher";
import { queryKeys } from "./keys";

// `status` and `retryAfterMs` feed `retryQuery`/`queryRetryDelay`: a 400 or 404 is final,
// and a 429 waits as long as the server asked.
class DrepLookupError extends Error {
  constructor(readonly status: number, readonly serverMessage: string | null, readonly retryAfterMs?: number) {
    super(serverMessage ?? "DRep lookup failed.");
    this.name = "DrepLookupError";
  }
}

async function fetchDreps<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    signal.throwIfAborted();
    throw new DrepLookupError(response.ok ? 502 : response.status, null, retryAfterMs);
  }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error : null;
    throw new DrepLookupError(response.status, message, retryAfterMs);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new DrepLookupError(502, null);
  return parsed.data;
}

export const drepQueryOptions = (id: string) => queryOptions({
  queryKey: queryKeys.drep(id),
  queryFn: async ({ signal }) =>
    (await fetchDreps(`/api/v1/dreps?id=${encodeURIComponent(id)}`, DrepsResponseSchema, signal)).drep
});

/** Typing pauses this long before a search request, so each keystroke does not cost one. */
export const DREP_SEARCH_DEBOUNCE_MS = 250;

export const drepSearchQueryOptions = (query: string) => queryOptions({
  queryKey: queryKeys.drepSearch(query),
  queryFn: async ({ signal }) =>
    (await fetchDreps(`/api/v1/dreps/search?q=${encodeURIComponent(query)}`, DrepSearchResponseSchema, signal)).dreps,
  // The empty query is a random shortlist. Keep one sample for the session, so the list
  // does not reshuffle under the reader's cursor on every refetch.
  ...(query ? {} : { staleTime: Infinity }),
  // A search answers typing; the reader can type again instead of waiting out a retry.
  retry: false
});

/** Matches for the typed name, or the shortlist when it is empty. Off while `enabled` is false. */
export function useDrepSearch(text: string, enabled: boolean) {
  const query = text.trim();
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DREP_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useQuery({ ...drepSearchQueryOptions(debounced), enabled, placeholderData: keepPreviousData });
  return {
    query: debounced,
    dreps: search.data ?? [],
    loading: search.isFetching || debounced !== query,
    // Only a fresh list may answer Enter, or Enter opens a match for the previous text.
    fresh: debounced === query && !search.isPlaceholderData && search.isSuccess,
    // A failure answers only the text it searched, like `fresh`.
    failed: debounced === query && !search.isFetching && search.isError
  };
}

// The status, not the server's English text, picks the message the reader sees.
type LookupFailure = { kind: "unrecognised" | "network" } | { kind: "response"; status: number };

/**
 * Only the pasted text is local; the response belongs to Query. `initialId` re-shows the
 * DRep an existing certificate already names, so returning to the form keeps its card.
 */
export function useDrepLookup(initialId: string | null) {
  const [query, setQueryText] = useState(initialId ?? "");
  const [lookupId, setLookupId] = useState(initialId ?? "");
  const [unrecognised, setUnrecognised] = useState(false);
  const drep = useQuery({ ...drepQueryOptions(lookupId), enabled: !!lookupId });
  // Typing dismisses the "type something" hint; it answered the previous text.
  const setQuery = (text: string) => {
    setQueryText(text);
    setUnrecognised(false);
  };
  const lookup = () => {
    const id = extractDrepId(query);
    setUnrecognised(!id);
    if (id) {
      setLookupId(id);
      if (id === lookupId) void drep.refetch();
    }
  };
  /** Show `id` as if the reader had looked it up: for a DRep saved from elsewhere (a draft). */
  const seed = (id: string) => {
    setQueryText(id);
    setLookupId(id);
    setUnrecognised(false);
  };
  // A lookup error belongs to the id it looked up; once the text moves on, it is stale.
  const failure: LookupFailure | null = unrecognised ? { kind: "unrecognised" }
    : drep.isFetching || !drep.error || extractDrepId(query) !== lookupId ? null
    : drep.error instanceof DrepLookupError ? { kind: "response", status: drep.error.status }
    : { kind: "network" };
  return { query, setQuery, result: drep.data ?? null, loading: drep.isFetching, failure, lookup, seed };
}
