import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ fetchAccountInfo: vi.fn() }));

vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class {
    fetchAccountInfo = holder.fetchAccountInfo;
  }
}));

const { useStakingRewards } = await import(
  "@/components/user/workspace/use-staking-rewards"
);

const account = {
  active: true,
  poolId: "pool1example",
  balance: "100000000",
  rewards: "2500000",
  withdrawals: "500000"
};

describe("useStakingRewards", () => {
  beforeEach(() => holder.fetchAccountInfo.mockReset());

  it("loads the exact withdrawable balance into the claim draft", async () => {
    holder.fetchAccountInfo.mockResolvedValue(account);
    const setAmount = vi.fn();
    const clearAddress = vi.fn();
    const { result } = renderHook(() =>
      useStakingRewards("stake_test1derived", true, "1000000", setAmount, clearAddress)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(holder.fetchAccountInfo).toHaveBeenCalledWith("stake_test1derived");
    expect(clearAddress).toHaveBeenCalledWith("");
    expect(setAmount).toHaveBeenLastCalledWith("2500000");
    expect(result.current).toMatchObject({
      rewardsLovelace: "2500000",
      poolId: "pool1example",
      active: true,
      error: false
    });
  });

  it("blocks a claim when no rewards are available", async () => {
    holder.fetchAccountInfo.mockResolvedValue({ ...account, active: false, rewards: "0" });
    const setAmount = vi.fn();
    const clearAddress = vi.fn();
    const { result } = renderHook(() =>
      useStakingRewards("stake_test1derived", true, "1000000", setAmount, clearAddress)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(setAmount).toHaveBeenLastCalledWith("");
    expect(result.current.rewardsLovelace).toBe("0");
  });

  it("blocks a claim and retries after a lookup failure", async () => {
    holder.fetchAccountInfo
      .mockRejectedValueOnce(new Error("lookup failed"))
      .mockResolvedValueOnce({ ...account, rewards: "3000000" });
    const setAmount = vi.fn();
    const clearAddress = vi.fn();
    const { result } = renderHook(() =>
      useStakingRewards("stake_test1derived", true, "", setAmount, clearAddress)
    );

    await waitFor(() => expect(result.current.error).toBe(true));
    result.current.refresh();
    await waitFor(() => expect(result.current.rewardsLovelace).toBe("3000000"));

    expect(holder.fetchAccountInfo).toHaveBeenCalledTimes(2);
    expect(setAmount).toHaveBeenLastCalledWith("3000000");
  });

  it("does not query when staking is off", () => {
    const setAmount = vi.fn();
    const clearAddress = vi.fn();
    const { result } = renderHook(() =>
      useStakingRewards("stake_test1derived", false, "1000000", setAmount, clearAddress)
    );

    expect(holder.fetchAccountInfo).not.toHaveBeenCalled();
    expect(setAmount).toHaveBeenLastCalledWith("");
    expect(result.current.loading).toBe(false);
  });

  it("restores the chain balance after the form resets", async () => {
    holder.fetchAccountInfo.mockResolvedValue(account);
    const setAmount = vi.fn();
    const clearAddress = vi.fn();
    let amount = "";
    const { result, rerender } = renderHook(() =>
      useStakingRewards("stake_test1derived", true, amount, setAmount, clearAddress)
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    setAmount.mockClear();
    amount = "1000000";
    rerender();

    await waitFor(() => expect(setAmount).toHaveBeenCalledWith("2500000"));
    expect(holder.fetchAccountInfo).toHaveBeenCalledTimes(1);
  });
});
