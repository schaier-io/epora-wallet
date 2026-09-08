"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountInfoQueryOptions } from "@/lib/query/chain";
import { queryPolicy } from "@/lib/query/keys";

export type StakingRewardsState = {
  loading: boolean;
  error: boolean;
  rewardsLovelace: string;
  poolId: string | null;
  active: boolean;
  refresh: () => void;
};

export function useStakingRewards(
  rewardAddress: string | null,
  enabled: boolean,
  withdrawAmount: string,
  setWithdrawAmount: (amount: string) => void,
  setWithdrawRewardAddress: (address: string) => void
): StakingRewardsState {
  const canLoad = enabled && Boolean(rewardAddress);
  const query = useQuery({
    ...accountInfoQueryOptions(rewardAddress ?? ""),
    enabled: canLoad,
    refetchInterval: queryPolicy.activePollMs
  });
  const account = canLoad ? query.data : undefined;
  const invalidRewards = account !== undefined && !/^\d+$/.test(account.rewards);
  const state = {
    rewardsLovelace: account && !invalidRewards ? account.rewards : "0",
    poolId: account?.poolId ?? null,
    active: account?.active ?? false,
    loading: canLoad && (query.isPending || query.isFetching),
    error: canLoad && (query.isError || invalidRewards)
  };

  useEffect(() => { setWithdrawRewardAddress(""); }, [rewardAddress, enabled, setWithdrawRewardAddress]);
  useEffect(() => {
    // The draft is local intent. A failed or unfinished read cannot authorize a claim.
    const amount = !state.loading && !state.error && BigInt(state.rewardsLovelace) > 0n
      ? state.rewardsLovelace : "";
    if (withdrawAmount !== amount) setWithdrawAmount(amount);
  }, [setWithdrawAmount, state.error, state.loading, state.rewardsLovelace, withdrawAmount]);

  return { ...state, refresh: () => { if (canLoad) void query.refetch(); } };
}
