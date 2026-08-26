import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  stakingEnabled: false,
  stakingBaseAddress: "addr_test1staking" as string | null
}));

// The pool list fetches over the network and is D11's own surface; stub it.
vi.mock("@/components/user/pool-finder", () => ({
  PoolFinder: () => <div data-testid="pool-finder" />
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      isWalletStakingEnabledAtom: atom(() => holder.stakingEnabled),
      walletStakingBaseAddressAtom: atom(() => holder.stakingBaseAddress)
    };
  }
);

vi.mock("@/components/user/workspace/forms/use-stt-spend-form", () => ({
  useSttSpendForm: () => ({ walletOperatorPath: "admin", setWalletOperatorPath: vi.fn() })
}));

vi.mock("@/components/user/workspace/forms/use-withdraw-form", () => ({
  useWithdrawForm: () => ({ selectedStakePool: null, setSelectedStakePool: vi.fn() })
}));

const { SetIntendedStakeCredentialConfigView } = await import(
  "@/components/user/workspace/config-setintendedstakecredential-view"
);

function renderView({ stakingEnabled = false } = {}) {
  holder.stakingEnabled = stakingEnabled;
  return render(
    <Provider store={createStore()}>
      <SetIntendedStakeCredentialConfigView />
    </Provider>
  );
}

describe("section heading and description", () => {
  it("does not repeat the card title above it", () => {
    renderView();

    expect(screen.getByText("What turning it on does")).toBeInTheDocument();
    expect(screen.queryByText("Enable staking")).not.toBeInTheDocument();
  });

  it("drops the contract's vocabulary for the reader's", () => {
    renderView();

    expect(screen.queryByText(/enterprise address/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/records the wallet's own on-chain script as its stake address/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/This wallet cannot earn staking rewards yet\./)
    ).toBeInTheDocument();
  });

  it("labels the address so it is true after staking is on too", () => {
    renderView({ stakingEnabled: true });

    expect(screen.getByText("Staking address")).toBeInTheDocument();
    expect(screen.queryByText("New staking address")).not.toBeInTheDocument();
  });

  it("says nothing happens on a repeat, without saying no-op", () => {
    renderView({ stakingEnabled: true });

    expect(
      screen.getByText("Staking is already on for this wallet. Sending this again changes nothing.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/no-op/)).not.toBeInTheDocument();
  });
});

/**
 * `StakeAddressDiscoveryPanel` mounts in `workspace-sidebar-view.tsx:242`, so its
 * "Move it back" button is on every workspace screen — not a trip to the wallet home. And
 * nothing below this box delegates: `selectedStakePool` is written by the pool finder and
 * read by no builder, receipt or validator anywhere in the app.
 */
describe("what happens next", () => {
  it("stops sending the reader somewhere for a step the app offers itself", () => {
    renderView();

    expect(screen.queryByText(/a one-time step from the wallet home/)).not.toBeInTheDocument();
    expect(screen.queryByText(/then delegate to a pool below/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/The app will offer to move them, and that takes one more signature\./)
    ).toBeInTheDocument();
  });

  it("stops the pool list promising a delegation the app cannot do", () => {
    renderView();

    expect(screen.getByText("Browse stake pools")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is sent when you pick one: this app cannot delegate yet.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Pick a pool to delegate to (optional)")
    ).not.toBeInTheDocument();
    // The list itself stays; removing a whole feature block is the owner's call.
    expect(screen.getByTestId("pool-finder")).toBeInTheDocument();
  });
});
