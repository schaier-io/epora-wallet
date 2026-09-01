import { render, screen } from "@testing-library/react";
import type { TransactionInfo } from "@meshsdk/common";
import { describe, expect, it, vi } from "vitest";
import type { WalletActivityEvent } from "@/components/user/workspace/types";

const openWorkspaceIntent = vi.hoisted(() => vi.fn());
const activityState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

// The silk layer is a WebGL canvas loaded through `next/dynamic`. It draws decoration only.
vi.mock("@/components/user/card-silk-background", () => ({
  CardSilkBackground: () => null
}));

vi.mock("@/components/user/workspace/use-workspace-activity-state", () => ({
  useWorkspaceActivityState: () => activityState.value
}));

const { WorkspaceTransactionsView } = await import(
  "@/components/user/workspace/workspace-transactions-view"
);

function transaction(overrides: Partial<TransactionInfo> = {}): TransactionInfo {
  return {
    index: 0,
    block: "block-hash",
    hash: "ab".repeat(32),
    slot: "131928483",
    fees: "182397",
    size: 512,
    deposit: "0",
    invalidBefore: "",
    invalidAfter: "",
    inputs: [],
    outputs: [],
    ...overrides
  };
}

function activityEvent(overrides: Partial<WalletActivityEvent> = {}): WalletActivityEvent {
  return {
    id: "event-1",
    transaction: transaction(),
    label: "TOP-UP",
    title: "Funds added",
    badgeClassName: "",
    summary: "Someone added funds to this wallet.",
    amountSummary: "+8 ₳",
    amountClassName: "",
    actorLabel: "Connected wallet",
    actorDetail: null,
    details: [],
    inputUtxos: [],
    outputUtxos: [],
    ...overrides
  };
}

function renderView(overrides: Record<string, unknown> = {}) {
  openWorkspaceIntent.mockClear();
  activityState.value = {
    wealthSeries: [],
    wealthSeriesForAsset: () => [],
    walletTransactions: { loading: false, error: null },
    recentWalletActivityEvents: [],
    activityPageCount: 1,
    normalizedActivityPageIndex: 0,
    paginatedWalletActivityEvents: [],
    activityVisibleStart: 0,
    activityVisibleEnd: 0,
    activityRangeLabel: "Last 30 days",
    copyFeedback: null,
    activeAddress: "addr_test1connected",
    lockingContract: { address: "addr_test1wallet", error: null },
    selectedDetectedToken: { unit: "policy.asset" },
    assetDetailUnit: null,
    openAssetDetail: vi.fn(),
    copyTextToClipboard: vi.fn(),
    openWorkspaceIntent,
    refreshWalletTransactions: vi.fn(),
    setActivityPageIndex: vi.fn(),
    ...overrides
  };
  return render(<WorkspaceTransactionsView />);
}

/**
 * `lockingContract` resolves synchronously: it is either an address or an error carrying its
 * own reason ("Choose a smart wallet first. Its address comes from the wallet you pick.").
 * The heading told the reader to "prepare the receive address", which is a task with no
 * control on this screen and no bearing on why the activity is missing.
 */
describe("activity card, no wallet address", () => {
  it("names what is unavailable rather than issuing an instruction", () => {
    renderView({
      lockingContract: {
        address: null,
        error: "Choose a smart wallet first. Its address comes from the wallet you pick."
      }
    });

    expect(screen.getByText("Activity is unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Choose a smart wallet first/)).toBeInTheDocument();
    expect(screen.queryByText("Prepare the receive address first")).not.toBeInTheDocument();
  });
});

/**
 * Both time formatters return null when a transaction carries no `blockTime` — which is every
 * freshly submitted transaction until the indexer catches up. The row used to print
 * "Time not available" there; the slot converts close enough that a real time always wins,
 * and the raw slot counter stays out of the time position (it survives in the tooltip and
 * the Slot tile).
 */
describe("activity row timestamp", () => {
  it("derives a time from the slot when blockTime is missing", () => {
    const event = activityEvent({ transaction: transaction({ blockTime: undefined }) });
    const { container } = renderView({
      recentWalletActivityEvents: [event],
      paginatedWalletActivityEvents: [event],
      activityVisibleStart: 1,
      activityVisibleEnd: 1
    });

    const summary = container.querySelector("summary");
    expect(summary?.textContent).not.toContain("Time not available");
    expect(summary?.textContent).not.toContain("Slot 131928483");
    // Whether the visible label reads relative ("12d ago") or absolute depends on the day
    // the suite runs, so the wall-clock-dependent text is not asserted. The tooltip carries
    // the absolute time for the fixed slot, and that must stay a real time, not a slot.
    const timestampTooltip = [...(summary?.querySelectorAll("[title]") ?? [])]
      .map((element) => element.getAttribute("title"))
      .find((title) => title?.includes("Slot 131928483"));
    expect(timestampTooltip).toMatch(/\d{1,2}:\d{2} [AP]M UTC · Slot 131928483$/);
  });

  it("shows a real time when the transaction has one", () => {
    const event = activityEvent({
      transaction: transaction({ blockTime: Math.floor(Date.now() / 1000) - 3600 })
    });
    const { container } = renderView({
      recentWalletActivityEvents: [event],
      paginatedWalletActivityEvents: [event],
      activityVisibleStart: 1,
      activityVisibleEnd: 1
    });

    const summary = container.querySelector("summary");
    expect(summary?.textContent).toContain("1h ago");
    expect(summary?.textContent).not.toContain("Time not available");
  });
});

/**
 * Three names shipped for one destination: the sidebar card says "Receive funds", the hero
 * card says "Add funds", and this button said "Receive". The destination's own heading is
 * `${definition.label} details` = "Add funds details", so that is the name that wins here.
 */
describe("asset drill-down actions", () => {
  it("names the add-funds button after the screen it opens", () => {
    renderView({
      assetDetailUnit: "lovelace",
      wealthSeriesForAsset: () => [
        { timestamp: Date.now() - 86400000, value: 5 },
        { timestamp: Date.now(), value: 8 }
      ]
    });

    expect(screen.queryByRole("button", { name: "Receive" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Add funds" }).click();
    expect(openWorkspaceIntent).toHaveBeenCalledWith("add-funds", "lock-funds");
  });

  /**
   * The summary panel repeated the Card's own `rounded-xl` (14px). A child that matches its
   * parent's radius reads as floating loose rather than nested, the same defect settled on
   * the orphan-UTxO notice and the review rail's callouts.
   */
  it("sits one radius rung inside the Card", () => {
    const { container } = renderView({
      assetDetailUnit: "lovelace",
      wealthSeriesForAsset: () => [
        { timestamp: Date.now() - 86400000, value: 5 },
        { timestamp: Date.now(), value: 8 }
      ]
    });

    const panel = container.querySelector('[aria-label="ADA summary"]');
    expect(panel?.className).toContain("rounded-lg");
    expect(panel?.className).not.toContain("rounded-xl");
  });
});
