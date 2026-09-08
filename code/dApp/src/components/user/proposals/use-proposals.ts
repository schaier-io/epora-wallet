"use client";
import { useTranslations } from "next-intl";

import { useCallback, useMemo, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { proposalListQueryOptions } from "@/lib/proposals/query";
import { queryPolicy } from "@/lib/query/keys";
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

export function useProposals(
  enabled: boolean,
  signerKeyHash: string,
  walletUnit?: string
): ProposalsController {
  const i18n = useTranslations("ComponentsUserProposalsUseProposals");
  const client = useQueryClient();
  const options = useMemo(() => proposalListQueryOptions(signerKeyHash, walletUnit), [signerKeyHash, walletUnit]);
  const canLoad = enabled && Boolean(signerKeyHash);
  const query = useInfiniteQuery({
    ...options,
    enabled: canLoad,
    refetchInterval: canLoad ? queryPolicy.activePollMs : false
  });
  const refreshing = useRef(false);
  const loadingMoreRequest = useRef(false);
  const { fetchNextPage, hasNextPage, isFetching } = query;

  const refresh = useCallback(async () => {
    if (!canLoad) return;
    refreshing.current = true;
    loadingMoreRequest.current = false;
    try {
      await client.cancelQueries({ queryKey: options.queryKey, exact: true });
      client.setQueryData(options.queryKey, (current) => current ? {
        pages: current.pages.slice(0, 1),
        pageParams: current.pageParams.slice(0, 1)
      } : undefined);
      await client.invalidateQueries({ queryKey: options.queryKey, exact: true });
    } finally {
      refreshing.current = false;
    }
  }, [canLoad, client, options.queryKey]);

  const loadMore = useCallback(async () => {
    if (!canLoad || !hasNextPage || isFetching || refreshing.current || loadingMoreRequest.current) return;
    loadingMoreRequest.current = true;
    try {
      await fetchNextPage({ cancelRefetch: false });
    } finally {
      loadingMoreRequest.current = false;
    }
  }, [canLoad, fetchNextPage, hasNextPage, isFetching]);

  return {
    proposals: canLoad ? query.data?.pages.flatMap((page) => page.proposals) ?? [] : [],
    loading: canLoad && (query.isPending || (query.isFetching && !query.isFetchingNextPage)),
    loadingMore: canLoad && query.isFetchingNextPage,
    hasMore: canLoad && query.hasNextPage,
    error: canLoad && query.error
      ? getUserFacingErrorMessage(query.error, i18n("couldnTLoadProposals"))
      : null,
    refresh,
    loadMore
  };
}
