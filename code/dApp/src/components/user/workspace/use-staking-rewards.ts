"use client";

import { useCallback, useEffect, useState } from "react";

import { ServerFetcher } from "@/lib/mesh/server-fetcher";

export type StakingRewardsState = {
  loading: boolean;
  error: boolean;
  rewardsLovelace: string;
  poolId: string | null;
  active: boolean;
  refresh: () => void;
};

const EMPTY_REWARDS = {
  rewardsLovelace: "0",
  poolId: null,
  active: false
};

export function useStakingRewards(
  rewardAddress: string | null,
  enabled: boolean,
  withdrawAmount: string,
  setWithdrawAmount: (amount: string) => void,
  setWithdrawRewardAddress: (address: string) => void
): StakingRewardsState {
  const canLoad = enabled && Boolean(rewardAddress);
  const [refreshCount, setRefreshCount] = useState(0);
  const [state, setState] = useState<Omit<StakingRewardsState, "refresh">>({
    ...EMPTY_REWARDS,
    loading: canLoad,
    error: false
  });
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  useEffect(() => {
    setWithdrawRewardAddress("");
    if (!canLoad || !rewardAddress) {
      // This data-fetch effect must clear rewards when its chain key becomes unavailable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ ...EMPTY_REWARDS, loading: false, error: false });
      return;
    }

    let cancelled = false;
    // Clear the previous wallet's rewards before the new chain read resolves.
    setState({ ...EMPTY_REWARDS, loading: true, error: false });

    void new ServerFetcher()
      .fetchAccountInfo(rewardAddress)
      .then((account) => {
        if (cancelled) return;
        if (!/^\d+$/.test(account.rewards)) {
          throw new Error("The chain returned an invalid staking reward balance.");
        }

        setState({
          rewardsLovelace: account.rewards,
          poolId: account.poolId ?? null,
          active: account.active,
          loading: false,
          error: false
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ ...EMPTY_REWARDS, loading: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [canLoad, refreshCount, rewardAddress, setWithdrawRewardAddress]);

  useEffect(() => {
    const desiredAmount = !state.loading
      && !state.error
      && /^\d+$/.test(state.rewardsLovelace)
      && BigInt(state.rewardsLovelace) > 0n
      ? state.rewardsLovelace
      : "";
    if (withdrawAmount !== desiredAmount) {
      setWithdrawAmount(desiredAmount);
    }
  }, [setWithdrawAmount, state.error, state.loading, state.rewardsLovelace, withdrawAmount]);

  return { ...state, refresh };
}
