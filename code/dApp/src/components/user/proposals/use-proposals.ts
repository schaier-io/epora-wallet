"use client";
import { useCallback, useEffect, useState } from "react";
import { listProposals } from "@/lib/proposals/client";
import type { ProposalListItemDto } from "@/lib/proposals/types";

export type ProposalsController = {
  proposals: ProposalListItemDto[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

// Fetches the proposal list once signed in. No external data library is used in
// this codebase, so this mirrors the existing useEffect + manual-cancellation
// pattern (see use-wallet-balance.ts).
export function useProposals(enabled: boolean, walletUnit?: string): ProposalsController {
  const [proposals, setProposals] = useState<ProposalListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setProposals(await listProposals(walletUnit));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load proposals.");
    } finally {
      setLoading(false);
    }
  }, [enabled, walletUnit]);

  useEffect(() => {
    // Legitimate data-fetch effect (loads proposals once signed in).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void refresh();
  }, [refresh]);

  return { proposals, loading, error, refresh };
}
