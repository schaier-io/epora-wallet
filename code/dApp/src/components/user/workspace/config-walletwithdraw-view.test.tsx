import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  stakingEnabled: false,
  rewardAddress: "stake_test1derived" as string | null,
  openWorkspaceIntent: vi.fn(),
  withdrawAmount: "1000000",
  setWithdrawAmount: vi.fn() as (next: string) => void
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
    withdrawRewardAddress: "",
    setWithdrawRewardAddress: vi.fn()
  })
}));

const { WalletWithdrawConfigView } = await import(
  "@/components/user/workspace/config-walletwithdraw-view"
);

function renderView({ stakingEnabled = false, withdrawAmount = "1000000" } = {}) {
  holder.stakingEnabled = stakingEnabled;
  holder.openWorkspaceIntent = vi.fn();
  holder.withdrawAmount = withdrawAmount;
  holder.setWithdrawAmount = vi.fn();
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
  it("names what the section holds instead of repeating the card title", () => {
    renderView();

    expect(screen.getByText("Who approves this claim")).toBeInTheDocument();
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
        "Staking is off for this wallet, so it has earned nothing to claim. Turn it on, then choose a pool."
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
    expect(screen.queryByText(/Staking is off for this wallet/)).not.toBeInTheDocument();
    // The form itself is still there.
    expect(screen.getByLabelText("Rewards come from")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount to claim (ADA)")).toBeInTheDocument();
  });
});

/**
 * The field showed `formatLovelaceAsAda(withdrawAmount)` and parsed it back on every
 * keystroke. `parseAdaToLovelace("1.")` returns "1000000" (its pattern allows a trailing
 * dot) and `formatLovelaceAsAda` strips that back to "1", so React reset the box and erased
 * the dot as it was typed. The next digit then landed against the whole number, and 1.5
 * became 15 on a claim, silently.
 */
describe("claim amount entry", () => {
  it("keeps a decimal point while it is being typed", () => {
    renderView({ stakingEnabled: true, withdrawAmount: "" });
    const field = screen.getByLabelText("Amount to claim (ADA)") as HTMLInputElement;

    fireEvent.change(field, { target: { value: "1" } });
    expect(field.value).toBe("1");

    // The keystroke that used to be swallowed.
    fireEvent.change(field, { target: { value: "1." } });
    expect(field.value).toBe("1.");

    fireEvent.change(field, { target: { value: "1.5" } });
    expect(field.value).toBe("1.5");
    expect(holder.setWithdrawAmount).toHaveBeenLastCalledWith("1500000");
  });

  it("lets the field be cleared", () => {
    renderView({ stakingEnabled: true, withdrawAmount: "1000000" });
    const field = screen.getByLabelText("Amount to claim (ADA)") as HTMLInputElement;

    expect(field.value).toBe("1");
    fireEvent.change(field, { target: { value: "" } });
    expect(field.value).toBe("");
  });
});
