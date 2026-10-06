"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { z } from "zod";
import {
  ActiveGovernanceActionsResponseSchema,
  GovernanceActionsResponseSchema,
  type GovernanceAction
} from "@/lib/api/governance-actions";
import { extractGovernanceActionId } from "@/lib/governance/vote-json";
import { parseRetryAfterMs } from "@/lib/mesh/server-fetcher";
import { queryKeys } from "./keys";

// The open list changes only when an action is proposed or an epoch closes some.
const ACTIVE_ACTIONS_STALE_MS = 60_000;
const BARE_TX_HASH_PATTERN = /^[0-9a-f]{64}$/i;
// Typing `#12` passes `#1` on the way; wait for the text to settle before looking it up.
const TYPED_ID_SETTLE_MS = 300;

// `status` and `retryAfterMs` feed `retryQuery`/`queryRetryDelay`: a 400 or 404 is final,
// and a 429 waits as long as the server asked.
class GovernanceActionLookupError extends Error {
  constructor(readonly status: number, readonly serverMessage: string | null, readonly retryAfterMs?: number) {
    super(serverMessage ?? "Governance action lookup failed.");
    this.name = "GovernanceActionLookupError";
  }
}

async function fetchGovernanceJson<T extends z.ZodType>(url: string, schema: T, signal: AbortSignal): Promise<z.infer<T>> {
  const response = await fetch(url, { signal });
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
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new GovernanceActionLookupError(502, null);
  return parsed.data;
}

export const governanceActionQueryOptions = (id: string) => queryOptions({
  queryKey: queryKeys.governanceAction(id),
  queryFn: async ({ signal }) =>
    (await fetchGovernanceJson(
      `/api/v1/governance-actions?id=${encodeURIComponent(id)}`, GovernanceActionsResponseSchema, signal
    )).action
});

export const activeGovernanceActionsQueryOptions = () => queryOptions({
  queryKey: queryKeys.activeGovernanceActions(),
  queryFn: async ({ signal }) =>
    (await fetchGovernanceJson("/api/v1/governance-actions/active", ActiveGovernanceActionsResponseSchema, signal))
      .actions,
  staleTime: ACTIVE_ACTIONS_STALE_MS
});

/** Whether `id` (`gov_action1…` or `<tx hash>#<index>`) names `action`. */
function namesAction(action: GovernanceAction, id: string): boolean {
  return action.id === id || `${action.txHash}#${action.index}` === id;
}

/** The actions whose title, type, id or tx hash contain `text`, ignoring case. */
export function filterGovernanceActions(actions: GovernanceAction[], text: string): GovernanceAction[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return actions;
  return actions.filter((action) =>
    [action.title ?? "", action.type.replaceAll("_", " "), action.id, action.txHash]
      .some((field) => field.toLowerCase().includes(needle))
  );
}

// The status, not the server's English text, picks the message the reader sees.
type LookupFailure = { kind: "network" } | { kind: "response"; status: number };

/**
 * One search box over the open actions. Text filters the list; a pasted id, tx reference
 * or explorer link selects that action at once, from the list when it is open and from the
 * lookup route otherwise. A tx hash alone shows its open actions, or looks up `#0` when
 * none is open. `initialId` re-selects the action an existing vote payload already names.
 */
export function useGovernanceActionPicker(initialId: string | null) {
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const [pickedId, setPickedId] = useState(initialId ?? "");
  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query), TYPED_ID_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const open = useQuery(activeGovernanceActionsQueryOptions());
  const openActions = open.data ?? [];
  const matches = filterGovernanceActions(openActions, query);
  const settled = settledQuery.trim();
  const bareTxHash = BARE_TX_HASH_PATTERN.test(settled) ? settled.toLowerCase() : null;
  const typedId = extractGovernanceActionId(settledQuery)
    ?? (bareTxHash && !open.isPending && filterGovernanceActions(openActions, settled).length === 0
      ? `${bareTxHash}#0` : null);
  const selectedId = typedId ?? pickedId;
  const listed = selectedId ? openActions.find((action) => namesAction(action, selectedId)) ?? null : null;
  // Wait for the list, so an open action is never fetched a second time.
  const lookup = useQuery({
    ...governanceActionQueryOptions(selectedId),
    enabled: !!selectedId && !listed && !open.isPending
  });
  const failure: LookupFailure | null = listed || lookup.isFetching || !lookup.error ? null
    : lookup.error instanceof GovernanceActionLookupError ? { kind: "response", status: lookup.error.status }
    : { kind: "network" };
  // Picking clears the search, so the picked action stays selected while the reader
  // searches again. Voting picks too, so a pasted action survives an edit of the box.
  const pick = (action: GovernanceAction) => {
    // Keep the id the card was fetched under, so the card does not fetch again.
    setPickedId(namesAction(action, selectedId) ? selectedId : action.id);
    setQuery("");
    setSettledQuery("");
  };
  return {
    query,
    setQuery,
    // A typed id shows its card instead of the list.
    actions: typedId ? [] : matches,
    openCount: openActions.length,
    settling: query !== settledQuery,
    listLoading: open.isPending,
    listFailed: open.isError,
    result: listed ?? lookup.data ?? null,
    loading: !listed && lookup.isFetching,
    failure,
    pick
  };
}
