"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletContext } from "@/providers/wallet-provider";
import { proposalKeys, proposalSessionQueryOptions } from "@/lib/proposals/query";
import { syncForSiteVisit, type VisitSyncResult } from "@/lib/stt-cache/visit-sync-client";

export type SiteVisitSyncState = "idle" | "syncing" | "complete" | "incomplete" | "busy" | "failed";
const IDLE_SYNC_STATE: SiteVisitSyncState = "idle";

export function useSiteVisitSync(): SiteVisitSyncState {
  const client = useQueryClient();
  const { activeWallet, activeAddress, walletSessionLoading, isDemoWallet } = useWalletContext();
  const session = useQuery(proposalSessionQueryOptions());
  const eligible = !walletSessionLoading && !isDemoWallet &&
    (Boolean(activeWallet && activeAddress) || Boolean(session.data));
  const requested = useRef(false);
  const mounted = useRef(false);
  const [state, setState] = useState<SiteVisitSyncState>(IDLE_SYNC_STATE);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!eligible || requested.current) return;
    const start = () => {
      if (document.visibilityState === "hidden" || requested.current) return;
      requested.current = true;
      setState("syncing");
      // Keep the bounded server request alive across Strict Mode cleanup. QueryClient
      // also shares this request between the main page and the proposals page.
      void syncForSiteVisit(client, activeWallet && activeAddress ? activeAddress : undefined)
        .then(async (result: VisitSyncResult) => {
          if (result.outcome === "ran") {
            await client.invalidateQueries({ queryKey: proposalKeys.all,
              predicate: query => ["list", "detail", "wallet-signers"].includes(String(query.queryKey[3])) });
          }
          if (!mounted.current) return;
          setState(result.outcome === "ran"
            ? result.continuationNeeded || !result.historyComplete || !result.walletReconcileComplete
              ? "incomplete" : "complete"
            : result.outcome === "skipped" ? IDLE_SYNC_STATE : result.outcome);
        }).catch(() => { if (mounted.current) setState("failed"); });
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => document.removeEventListener("visibilitychange", start);
  }, [eligible, activeWallet, activeAddress, client]);

  return eligible ? state : IDLE_SYNC_STATE;
}
