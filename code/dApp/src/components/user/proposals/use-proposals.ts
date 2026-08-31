"use client";
import { useTranslations } from "next-intl";

import { useCallback, useEffect, useRef, useState } from "react";
import { listProposals } from "@/lib/proposals/client";
import type { ProposalListItemDto } from "@/lib/proposals/types";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

export type ProposalsController = {
  proposals: ProposalListItemDto[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

// Fetches the proposal list once signed in. No external data library is used in
// this codebase, so request generations prevent stale async responses from
// overwriting a newer refresh.
export function useProposals(enabled: boolean, walletUnit?: string): ProposalsController {
  const i18n = useTranslations("ComponentsUserProposalsUseProposals");
  const [proposals, setProposals] = useState<ProposalListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const refreshing = useRef(false);
  const loadingMoreRequest = useRef(false);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    refreshing.current = enabled;
    loadingMoreRequest.current = false;
    setLoadingMore(false);
    if (!enabled) {
      setProposals([]);
      setNextCursor(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await listProposals({ walletUnit });
      if (generation !== requestGeneration.current) return;
      setProposals(page.proposals);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      setError(getUserFacingErrorMessage(caught, i18n("couldnTLoadProposals")));
    } finally {
      if (generation === requestGeneration.current) {
        refreshing.current = false;
        setLoading(false);
      }
    }
  }, [enabled, i18n, walletUnit]);

  const loadMore = useCallback(async () => {
    if (!enabled || !nextCursor || refreshing.current || loadingMoreRequest.current) return;
    const generation = requestGeneration.current;
    loadingMoreRequest.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listProposals({ walletUnit, cursor: nextCursor });
      if (generation !== requestGeneration.current) return;
      setProposals((current) => [...current, ...page.proposals]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      setError(getUserFacingErrorMessage(caught, i18n("couldnTLoadMoreProposals")));
    } finally {
      if (generation === requestGeneration.current) {
        loadingMoreRequest.current = false;
        setLoadingMore(false);
      }
    }
  }, [enabled, i18n, nextCursor, walletUnit]);

  useEffect(() => {
    // Legitimate data-fetch effect (loads proposals once signed in).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void refresh();
  }, [refresh]);

  return {
    proposals,
    loading,
    loadingMore,
    hasMore: nextCursor !== null,
    error,
    refresh,
    loadMore
  };
}
