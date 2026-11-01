import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { CHAIN_NETWORK } from "@/lib/query/keys";
import { STT_VISIT_SYNC_COOLDOWN_MS, STT_VISIT_SYNC_PATH } from "./visit-sync-policy";

const cooldown = z.number().finite().nonnegative().max(STT_VISIT_SYNC_COOLDOWN_MS);
const VisitResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("ran"), retryAfterMs: cooldown,
    historyComplete: z.boolean(), walletReconcileComplete: z.boolean(), continuationNeeded: z.boolean()
  }),
  z.object({ outcome: z.literal("skipped"), retryAfterMs: cooldown }),
  z.object({ outcome: z.literal("busy"), retryAfterMs: cooldown })
]);

export type VisitSyncResult = (z.infer<typeof VisitResultSchema> | { outcome: "failed"; retryAfterMs: number }) & {
  nextAttemptAt: number;
};

export const visitSyncKey = ["stt-visit-sync", CHAIN_NETWORK] as const;

/** Imperative only: this query has no observer that can start a focus or timer refetch. */
export function syncForSiteVisit(client: QueryClient, address?: string): Promise<VisitSyncResult> {
  return client.fetchQuery({
    queryKey: visitSyncKey,
    retry: false,
    networkMode: "always",
    gcTime: STT_VISIT_SYNC_COOLDOWN_MS,
    staleTime: query => Math.max(0, (query.state.data?.nextAttemptAt ?? 0) - query.state.dataUpdatedAt),
    queryFn: async (): Promise<VisitSyncResult> => {
      try {
        const response = await fetch(STT_VISIT_SYNC_PATH, {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(address ? { address } : {})
        });
        if (!response.ok) throw new Error("Visit synchronization failed");
        const result = VisitResultSchema.parse(await response.json());
        return { ...result, nextAttemptAt: Date.now() + result.retryAfterMs };
      } catch {
        // A failed attempt waits for another eligible visit, never a retry timer.
        return { outcome: "failed", retryAfterMs: STT_VISIT_SYNC_COOLDOWN_MS,
          nextAttemptAt: Date.now() + STT_VISIT_SYNC_COOLDOWN_MS };
      }
    }
  });
}
