import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { TransactionInfo } from "@meshsdk/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletActivityEvent } from "@/components/user/workspace/types";

const openWorkspaceIntent = vi.hoisted(() => vi.fn());
const activityState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const streamingPayments = vi.hoisted(() => ({ value: [] as unknown[] }));
const { atom } = await import("jotai");
const { createDefaultStateForm } = await import("@/lib/contracts/state-form");

// The silk layer is a WebGL canvas loaded through `next/dynamic`. It draws decoration only.
vi.mock("@/components/user/card-silk-background", () => ({
  CardSilkBackground: () => null
}));

vi.mock("@/components/user/workspace/wallet-balance-chart-section", () => ({
  WalletBalanceChartSection: () => <div>Balance chart</div>
}));

vi.mock("@/components/user/workspace/use-workspace-activity-state", () => ({
  useWorkspaceActivityState: () => activityState.value
}));

// The streaming-expense section reads the wallet state through this atom. The
// override keeps every other export of the module real.
vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    activeInferredSttStateFormAtom: atom(() => ({
      ...(createDefaultStateForm() as object),
      streamingPayments: streamingPayments.value
    }))
  })
);

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
  // A fresh store per render: a shared default store would cache the read-only
  // streaming-state atom across tests and hide later fixtures.
  return render(
    <Provider store={createStore()}>
      <WorkspaceTransactionsView />
    </Provider>
  );
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
    // The absolute time is localized and carries its own timezone now, so only the
    // composition with the slot is pinned.
    expect(timestampTooltip).toMatch(/Slot 131928483$/);
    expect(timestampTooltip).toMatch(/\d{1,2}:\d{2}/);
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
 * Three names shipped for one destination: the sidebar card said "Receive funds", the hero
 * card said "Add funds", and this button said "Receive". "Add funds" is the one the
 * destination now carries, on its own heading and on the sidebar card, so it wins here.
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

  /**
   * The label sat on a role-less `div`, and a name on a generic element is ignored by
   * most screen readers, so the summary never reached assistive tech. `role="region"`
   * turns the name into a landmark assistive tech can list and jump to.
   */
  it("exposes the summary as a named region", () => {
    renderView({
      assetDetailUnit: "lovelace",
      wealthSeriesForAsset: () => [
        { timestamp: Date.now() - 86400000, value: 5 },
        { timestamp: Date.now(), value: 8 }
      ]
    });

    expect(screen.getByRole("region", { name: "ADA summary" })).toBeInTheDocument();
  });
});

/**
 * The Activity section shows a scheduled payment's accruing expense before any payout
 * settles it. The section reads the wallet state directly (not the transaction feed), so
 * it must appear even when the event list is empty, and it must stay labeled as a
 * projection so it cannot read as a settled transaction.
 */
describe("activity streaming-expense projections", () => {
  const DAY_MS = 86_400_000;
  const FIXED_NOW = 1_755_000_000_000;

  function activeStream() {
    return {
      id: "5",
      payoutAddress: "addr_test1payee",
      paidOutAmount: "0",
      policyId: "",
      assetName: "",
      amountPerDay: "1000000",
      startDate: String(FIXED_NOW - 3 * DAY_MS),
      endDate: String(FIXED_NOW + 7 * DAY_MS)
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    streamingPayments.value = [];
  });

  it("hides the section when the wallet has no scheduled payments", () => {
    renderView();

    expect(
      screen.queryByRole("region", { name: "Streaming expense projections" })
    ).not.toBeInTheDocument();
  });

  it("keeps transactions before the collapsed projections", () => {
    streamingPayments.value = [activeStream()];
    renderView();

    const toggle = screen.getByRole("button", { name: /Streaming expenses/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("No activity yet").compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText("Scheduled payment 1")).toBeInTheDocument();
    expect(screen.getByText("Unpaid now 3 ADA")).toBeInTheDocument();
    expect(screen.getAllByText("Projected").length).toBeGreaterThan(0);
  });

  it("shows the projection even while the event list is empty", () => {
    streamingPayments.value = [activeStream()];
    renderView();

    expect(screen.getByRole("button", { name: /Streaming expenses/ })).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("hides the section when the wallet address cannot be resolved", () => {
    streamingPayments.value = [activeStream()];
    renderView({ lockingContract: { address: null, error: "Choose a smart wallet first." } });

    expect(
      screen.queryByRole("region", { name: "Streaming expense projections" })
    ).not.toBeInTheDocument();
  });
});


it("shows recent transactions before optional balance history", () => {
  const event = activityEvent();
  renderView({ wealthSeries: [{ timestamp: 1, value: 8 }], recentWalletActivityEvents: [event], paginatedWalletActivityEvents: [event] });
  const toggle = screen.getByRole("button", { name: /Balance history/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Balance chart")).not.toBeInTheDocument();
  expect(screen.getByText("Funds added").compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(toggle);
  expect(screen.getByText("Balance chart")).toBeInTheDocument();
});


it("opens the selected asset before the transaction list", () => {
  const event = activityEvent();
  renderView({ assetDetailUnit: "lovelace", recentWalletActivityEvents: [event], paginatedWalletActivityEvents: [event] });
  expect(screen.getByRole("region", { name: "ADA summary" }).compareDocumentPosition(screen.getByText("Funds added")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Balance history/ })).not.toBeInTheDocument();
});
