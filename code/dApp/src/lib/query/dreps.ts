"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DrepsResponseSchema, extractDrepId } from "@/lib/api/dreps";
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

export const drepQueryOptions = (id: string) => queryOptions({
  queryKey: queryKeys.drep(id),
  queryFn: async ({ signal }) => {
    const response = await fetch(`/api/v1/dreps?id=${encodeURIComponent(id)}`, { signal });
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
    const parsed = DrepsResponseSchema.safeParse(payload);
    if (!parsed.success) throw new DrepLookupError(502, null);
    return parsed.data.drep;
  }
});

// The status, not the server's English text, picks the message the reader sees.
type LookupFailure = { kind: "unrecognised" | "network" } | { kind: "response"; status: number };

/**
 * Only the pasted text is local; the response belongs to Query. `initialId` re-shows the
 * DRep an existing certificate already names, so returning to the form keeps its card.
 */
export function useDrepLookup(initialId: string | null) {
  const [query, setQuery] = useState(initialId ?? "");
  const [lookupId, setLookupId] = useState(initialId ?? "");
  const [unrecognised, setUnrecognised] = useState(false);
  const drep = useQuery({ ...drepQueryOptions(lookupId), enabled: !!lookupId });
  const lookup = () => {
    const id = extractDrepId(query);
    setUnrecognised(!id);
    if (id) {
      setLookupId(id);
      if (id === lookupId) void drep.refetch();
    }
  };
  const failure: LookupFailure | null = unrecognised ? { kind: "unrecognised" }
    : drep.isFetching || !drep.error ? null
    : drep.error instanceof DrepLookupError ? { kind: "response", status: drep.error.status }
    : { kind: "network" };
  return { query, setQuery, result: drep.data ?? null, loading: drep.isFetching, failure, lookup };
}
