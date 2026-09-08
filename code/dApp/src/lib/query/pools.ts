"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PoolsResponseSchema } from "@/lib/api/pools";
import { parseRetryAfterMs } from "@/lib/mesh/server-fetcher";
import { queryKeys } from "./keys";

class PoolLookupError extends Error {
  constructor(readonly status: number, readonly serverMessage: string | null, readonly retryAfterMs?: number) {
    super(serverMessage ?? "Pool lookup failed.");
    this.name = "PoolLookupError";
  }
}

export const poolQueryOptions = (id: string) => queryOptions({
  queryKey: queryKeys.pool(id),
  queryFn: async ({ signal }) => {
    const response = await fetch(`/api/v1/pools?id=${encodeURIComponent(id)}`, { signal });
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
    const parsed = PoolsResponseSchema.safeParse(payload);
    if (!parsed.success) throw new PoolLookupError(502, null);
    return parsed.data.pool;
  }
});

type LookupFailure = { kind: "empty" | "network" } | { kind: "response"; message: string | null };

/** Only the search text and validation state are local; the response belongs to Query. */
export function usePoolLookup() {
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [missingId, setMissingId] = useState(false);
  const pool = useQuery({ ...poolQueryOptions(lookupId), enabled: !!lookupId });
  const lookup = () => {
    if (pool.isFetching) return;
    const id = query.trim();
    setMissingId(!id);
    if (!id) return;
    if (id === lookupId) {
      // fetchQuery reuses fresh data and retries failed entries. Query deduplicates Enter/button requests.
      void client.fetchQuery(poolQueryOptions(id)).catch(() => undefined);
    } else {
      setLookupId(id);
    }
  };
  const failure: LookupFailure | null = missingId ? { kind: "empty" }
    : pool.isFetching || !pool.error ? null
    : pool.error instanceof PoolLookupError ? { kind: "response", message: pool.error.serverMessage }
    : { kind: "network" };
  return { query, setQuery, result: pool.data ?? null, loading: pool.isFetching, failure, lookup };
}
