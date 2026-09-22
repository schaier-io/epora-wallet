"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { GovernanceActionsResponseSchema } from "@/lib/api/governance-actions";
import { extractGovernanceActionId } from "@/lib/governance/vote-json";
import { parseRetryAfterMs } from "@/lib/mesh/server-fetcher";
import { queryKeys } from "./keys";

// `status` and `retryAfterMs` feed `retryQuery`/`queryRetryDelay`: a 400 or 404 is final,
// and a 429 waits as long as the server asked.
class GovernanceActionLookupError extends Error {
  constructor(readonly status: number, readonly serverMessage: string | null, readonly retryAfterMs?: number) {
    super(serverMessage ?? "Governance action lookup failed.");
    this.name = "GovernanceActionLookupError";
  }
}

export const governanceActionQueryOptions = (id: string) => queryOptions({
  queryKey: queryKeys.governanceAction(id),
  queryFn: async ({ signal }) => {
    const response = await fetch(`/api/v1/governance-actions?id=${encodeURIComponent(id)}`, { signal });
    const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      signal.throwIfAborted();
      throw new GovernanceActionLookupError(response.ok ? 502 : response.status, null, retryAfterMs);
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error : null;
      throw new GovernanceActionLookupError(response.status, message, retryAfterMs);
    }
    const parsed = GovernanceActionsResponseSchema.safeParse(payload);
    if (!parsed.success) throw new GovernanceActionLookupError(502, null);
    return parsed.data.action;
  }
});

// The status, not the server's English text, picks the message the reader sees.
type LookupFailure = { kind: "unrecognised" | "network" } | { kind: "response"; status: number };

/**
 * Only the pasted text is local; the response belongs to Query. `initialId` re-shows the
 * action an existing vote payload already names, so returning to the form keeps its card.
 */
export function useGovernanceActionLookup(initialId: string | null) {
  const [query, setQuery] = useState(initialId ?? "");
  const [lookupId, setLookupId] = useState(initialId ?? "");
  const [unrecognised, setUnrecognised] = useState(false);
  const action = useQuery({ ...governanceActionQueryOptions(lookupId), enabled: !!lookupId });
  const lookup = () => {
    const id = extractGovernanceActionId(query);
    setUnrecognised(!id);
    if (id) {
      setLookupId(id);
      if (id === lookupId) void action.refetch();
    }
  };
  const failure: LookupFailure | null = unrecognised ? { kind: "unrecognised" }
    : action.isFetching || !action.error ? null
    : action.error instanceof GovernanceActionLookupError ? { kind: "response", status: action.error.status }
    : { kind: "network" };
  return { query, setQuery, result: action.data ?? null, loading: action.isFetching, failure, lookup };
}
