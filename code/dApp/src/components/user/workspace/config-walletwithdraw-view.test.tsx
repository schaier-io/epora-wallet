import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  stakingEnabled: false,
  rewardAddress: "stake_test1derived" as string | null,
  openWorkspaceIntent: vi.fn(),
  withdrawAmount: "",
  setWithdrawAmount: vi.fn() as (next: string) => void,
  setWithdrawRewardAddress: vi.fn() as (next: string) => void,
  rewards: {
    loading: false,
    error: false,
    rewardsLovelace: "2500000",
    poolId: "pool1example" as string | null,
    active: true,
    refresh: vi.fn()
  }
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      isWalletStakingEnabledAtom: atom(() => holder.stakingEnabled),
      walletRewardAddressAtom: atom(() => holder.rewardAddress)
    };
  }
);

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    activeFieldErrors: {},
    openWorkspaceIntent: holder.openWorkspaceIntent
  })
}));

vi.mock("@/components/user/workspace/forms/use-stt-spend-form", () => ({
  useSttSpendForm: () => ({ walletOperatorPath: "admin", setWalletOperatorPath: vi.fn() })
}));

vi.mock("@/components/user/workspace/forms/use-withdraw-form", () => ({
  useWithdrawForm: () => ({
    withdrawAmount: holder.withdrawAmount,
    setWithdrawAmount: holder.setWithdrawAmount,
    setWithdrawRewardAddress: holder.setWithdrawRewardAddress
  })
}));

vi.mock("@/components/user/workspace/use-staking-rewards", () => ({
  useStakingRewards: () => holder.rewards
}));

const { WalletWithdrawConfigView } = await import(
  "@/components/user/workspace/config-walletwithdraw-view"
);

function renderView({
  stakingEnabled = false,
  rewards = {}
}: {
  stakingEnabled?: boolean;
  rewards?: Partial<typeof holder.rewards>;
} = {}) {
  holder.stakingEnabled = stakingEnabled;
  holder.openWorkspaceIntent = vi.fn();
  holder.withdrawAmount = "";
  holder.setWithdrawAmount = vi.fn();
  holder.setWithdrawRewardAddress = vi.fn();
  holder.rewards = {
    loading: false,
    error: false,
    rewardsLovelace: "2500000",
    poolId: "pool1example",
    active: true,
    refresh: vi.fn(),
    ...rewards
  };
  return render(
    <Provider store={createStore()}>
      <WalletWithdrawConfigView />
    </Provider>
  );
}

/**
 * `UserActionConfigurationCard` renders "Claim staking rewards details" directly above this
 * view (the label is "Claim staking rewards", `action-definitions.ts:258`), and describes the
 * action three more times through routeExplanation, outcome, and the "What this does" panel.
 * The section heading here was the same words a fifth time.
 */
describe("section heading", () => {
  it("leaves approval routing to the review rail", () => {
    renderView();

    expect(screen.queryByText("Who approves this claim")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sign as")).not.toBeInTheDocument();
    expect(screen.queryByText("Claim staking rewards")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Moves rewards already earned by this wallet's stake address/)
    ).not.toBeInTheDocument();
  });
});

/**
 * The old warning ended "Turn on staking first, then delegate to a pool." on a screen with no
 * control that does either. The app has the action; the reader had to go and find it.
 */
describe("staking is off", () => {
  it("offers the fix instead of naming a task with no control", async () => {
    renderView();

    const button = screen.getByRole("button", { name: "Turn on staking" });
    button.click();

    expect(holder.openWorkspaceIntent).toHaveBeenCalledWith(
      "enable-staking",
      "set-intended-stake-credential"
    );
  });

  it("states the blocker once, in its own words", () => {
    renderView();

    expect(
      screen.getByText(
        "This wallet cannot claim rewards while staking is off. Turn it on, then choose a pool."
      )
    ).toBeInTheDocument();
    // The review rail still carries the longer version; this copy is the one with a control.
    expect(
      screen.queryByText(/Staking is not on for this wallet yet/)
    ).not.toBeInTheDocument();
  });

  // A guard, not a change assertion: this one passes against the pre-change file too, because
  // the old warning was already conditional. It is here so the new button cannot leak into the
  // staking-on state later.
  it("says nothing about staking once it is on", () => {
    renderView({ stakingEnabled: true });

    expect(screen.queryByRole("button", { name: "Turn on staking" })).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot claim rewards while staking is off/)).not.toBeInTheDocument();
    expect(screen.getByText("Available to claim")).toBeInTheDocument();
  });
});

describe("automatic claim details", () => {
  it("shows the exact maximum and removes manual claim fields", () => {
    renderView({ stakingEnabled: true });

    expect(screen.getByText("2.5 ADA available to claim")).toBeInTheDocument();
    expect(screen.getByText("stake_test1derived")).toBeInTheDocument();
    expect(screen.getByText("pool1example")).toBeInTheDocument();
    expect(
      screen.getByText("The claim will collect the full available reward balance.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Rewards come from")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount to claim (ADA)")).not.toBeInTheDocument();
  });

  it("shows a loading state", () => {
    renderView({ stakingEnabled: true, rewards: { loading: true } });

    expect(screen.getByText("Checking available staking rewards…")).toBeInTheDocument();
  });

  it("shows the zero-reward state", () => {
    renderView({ stakingEnabled: true, rewards: { rewardsLovelace: "0" } });

    expect(screen.getByText("No staking rewards are available to claim.")).toBeInTheDocument();
  });

  it("offers a retry after a lookup failure", () => {
    renderView({ stakingEnabled: true, rewards: { error: true } });

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(holder.rewards.refresh).toHaveBeenCalledTimes(1);
  });

  it("states when the reward account is not delegated", () => {
    renderView({
      stakingEnabled: true,
      rewards: { active: false, poolId: null, rewardsLovelace: "0" }
    });

    expect(screen.getByText("This wallet is not delegated to a stake pool.")).toBeInTheDocument();
  });
});
