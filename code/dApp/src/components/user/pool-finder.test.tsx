import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { PoolFinder, type StakePool } from "@/components/user/pool-finder";

const BASE_POOL: StakePool = {
  poolId: "pool1abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmn",
  ticker: "EPORA",
  name: "Epora Pool",
  homepage: null,
  description: null,
  saturation: 0.42,
  liveStakeLovelace: "1000000000",
  activeStakeLovelace: "1000000000",
  declaredPledgeLovelace: "1000000",
  livePledgeLovelace: "1000000",
  marginPct: 0.02,
  fixedCostLovelace: "340000000",
  blocksMinted: 12,
  retiring: false
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The card only offers the pick button for a pool that is not already picked, so every test
 * that needs it looks one up with nothing picked yet.
 */
async function lookUp(pool: StakePool, onSelect = vi.fn()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ pool }) }))
  );
  const result = render(<PoolFinder selectedPool={null} onSelect={onSelect} />);
  fireEvent.change(screen.getByLabelText("Find your pool"), {
    target: { value: pool.poolId }
  });
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await waitFor(() => expect(screen.getByText(shownTitle(pool))).toBeInTheDocument());
  return { ...result, onSelect };
}

function shownTitle(pool: StakePool): string {
  return pool.ticker ? `[${pool.ticker}]` : "Stake pool";
}

/**
 * `selectedStakePoolAtom` (`workspace/atoms/forms/withdraw-form.atoms.ts:9`) is written
 * only by this component and read only by the screen that renders it, to hand the value
 * straight back. Nothing builds, validates or submits a delegation anywhere in the app.
 */
describe("the pick control tells the truth", () => {
  it("offers to pick a pool, not to delegate to one", async () => {
    await lookUp(BASE_POOL);

    expect(screen.getByRole("button", { name: "Pick this pool" })).toBeInTheDocument();
    expect(screen.queryByText("Delegate to this pool")).not.toBeInTheDocument();
  });

  it("hands the whole pool back when picked", async () => {
    const { onSelect } = await lookUp(BASE_POOL);

    fireEvent.click(screen.getByRole("button", { name: "Pick this pool" }));

    expect(onSelect).toHaveBeenCalledWith(BASE_POOL);
  });

  it("marks an already picked pool without claiming a delegation", () => {
    render(<PoolFinder selectedPool={BASE_POOL} onSelect={vi.fn()} />);

    expect(screen.getByText("Picked")).toBeInTheDocument();
    expect(screen.queryByText("Selected to delegate")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});

describe("a closing pool explains its own disabled button", () => {
  it("says why instead of greying out with no reason", async () => {
    await lookUp({ ...BASE_POOL, retiring: true });

    const button = screen.getByRole("button", { name: "This pool is closing" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Retiring")).toBeInTheDocument();
    expect(screen.queryByText("Pick this pool")).not.toBeInTheDocument();
  });
});

describe("missing figures", () => {
  it("says the figure is unknown rather than printing a dash", () => {
    render(
      <PoolFinder
        selectedPool={{
          ...BASE_POOL,
          saturation: null,
          marginPct: null,
          liveStakeLovelace: null,
          fixedCostLovelace: null
        }}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getAllByText("Unknown")).toHaveLength(4);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("lookup", () => {
  it("shows the pool the server returns", async () => {
    await lookUp(BASE_POOL);

    expect(screen.getByText("42.0%")).toBeInTheDocument();
    expect(screen.getByText("2.0%")).toBeInTheDocument();
  });

  it("asks for a pool id before it calls the server", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    expect(screen.getByText("Paste a pool id (pool1…) to look it up.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not repeat the helper text inside the box", () => {
    render(<PoolFinder selectedPool={null} onSelect={vi.fn()} />);

    const input = screen.getByLabelText("Find your pool");
    expect(input).toHaveAttribute("placeholder", "pool1…");
    expect(
      screen.getByText(/Browse pools on pool.pm or cexplorer.io and paste the pool id/)
    ).toBeInTheDocument();
  });
});

describe("depth", () => {
  it("sits one rung inside the panel that holds it", () => {
    const { container } = render(<PoolFinder selectedPool={BASE_POOL} onSelect={vi.fn()} />);

    // The staking screen wraps this in a rounded-lg panel, so the card inside it cannot be
    // rounded-xl without reading as the wider of the two.
    expect(container.querySelector(".rounded-md.border")).not.toBeNull();
    expect(container.querySelector(".rounded-xl")).toBeNull();
  });
});
