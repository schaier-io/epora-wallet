import "@/test/mock-workspace-queries";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamsFixture = vi.hoisted(() => ({ value: [] as unknown[] }));
const { atom } = await import("jotai");
const { createDefaultStateForm } = await import("@/lib/contracts/state-form");

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    activeInferredSttStateFormAtom: atom(() => ({
      ...(createDefaultStateForm() as object),
      streamingPayments: streamsFixture.value
    }))
  })
);

const { WorkspaceStreamingExpenseProjectionsView } = await import(
  "@/components/user/workspace/workspace-streaming-expense-projections-view"
);

const DAY_MS = 86_400_000;
const NOW = 1_755_000_000_000;
// policy ids are 28 bytes; "TKN" decodes from 544b4e.
const TOKEN_POLICY_ID = "ab".repeat(28);
const TKN_UNIT = `${TOKEN_POLICY_ID}544b4e`;

function stream(overrides: Record<string, unknown> = {}) {
  return {
    id: "3",
    payoutAddress: "addr_test1payee",
    paidOutAmount: "0",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: String(NOW - 3 * DAY_MS),
    endDate: String(NOW + 7 * DAY_MS),
    ...overrides
  };
}

function renderView() {
  const store = createStore();
  return render(
    <Provider store={store}>
      <WorkspaceStreamingExpenseProjectionsView />
    </Provider>
  );
}

function renderExpandedView() {
  const view = renderView();
  const toggle = screen.getByRole("button", { name: /^Streaming expenses/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Scheduled payment 1")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  return view;
}

// The display clock seeds from Date.now() at first render, so the fixture
// dates are pinned to a fixed system time: without this the accrued figure
// would drift with the wall clock between the fixture and the render.
beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
  streamsFixture.value = [];
});

describe("streaming expense projections in Activity", () => {
  it("renders nothing while the wallet has no scheduled payments", () => {
    const { container } = renderView();
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the accrual as a projection and identifies the stream and payee", () => {
    streamsFixture.value = [stream()];
    renderExpandedView();

    expect(screen.getByRole("region", { name: /^Streaming expenses/ })).toBeInTheDocument();
    // The section and the as-of line already say these are projections; no per-row badge.
    expect(screen.queryByText("Projected")).not.toBeInTheDocument();
    expect(screen.getByText("Scheduled payment 1")).toBeInTheDocument();
    expect(screen.getByText("addr_test1payee")).toBeInTheDocument();
    // 3 whole days at 1 ADA/day, accrued but not yet paid out.
    expect(screen.getByText("Unpaid now 3 ADA")).toBeInTheDocument();
    expect(screen.getByText(/Projected as of/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("carries no transaction hash, fee, or confirmation status", () => {
    streamsFixture.value = [stream()];
    const { container } = renderExpandedView();

    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByText("Fee")).not.toBeInTheDocument();
    expect(screen.queryByText(/Tx hash/)).not.toBeInTheDocument();
  });

  it("shows a not-yet-started stream with nothing accrued", () => {
    streamsFixture.value = [
      stream({ startDate: String(NOW + 2 * DAY_MS), endDate: String(NOW + 9 * DAY_MS) })
    ];
    renderExpandedView();

    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("Unpaid now 0 ADA")).toBeInTheDocument();
  });

  it("shows an ended stream that still owes its unpaid remainder", () => {
    streamsFixture.value = [
      stream({
        startDate: String(NOW - 9 * DAY_MS),
        endDate: String(NOW - DAY_MS),
        paidOutAmount: "3000000"
      })
    ];
    renderExpandedView();

    expect(screen.getByText("Ended")).toBeInTheDocument();
    // 8 ADA accrued, 3 ADA settled.
    expect(screen.getByText("Unpaid now 5 ADA")).toBeInTheDocument();
  });

  it("shows a fully settled stream as finished with nothing unpaid", () => {
    streamsFixture.value = [
      stream({
        startDate: String(NOW - 9 * DAY_MS),
        endDate: String(NOW - DAY_MS),
        paidOutAmount: "10000000"
      })
    ];
    renderExpandedView();

    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("Unpaid now 0 ADA")).toBeInTheDocument();
  });

  /**
   * The unpaid line was unconditionally amber, so a stream owing nothing wore the same
   * alert colour as one behind on its payouts. Amber is now the "you owe money" colour.
   */
  it("uses the alert colour only when the stream actually owes money", () => {
    streamsFixture.value = [stream()];
    const { unmount } = renderExpandedView();

    expect(screen.getByText("Unpaid now 3 ADA").className).toContain("text-amber-100");

    unmount();
    streamsFixture.value = [
      stream({ startDate: String(NOW + 2 * DAY_MS), endDate: String(NOW + 9 * DAY_MS) })
    ];
    renderExpandedView();

    const settled = screen.getByText("Unpaid now 0 ADA");
    expect(settled.className).not.toContain("text-amber-100");
    expect(settled.className).toContain("text-foreground");
  });

  it("keeps native-asset streams in their own unit", () => {
    streamsFixture.value = [
      stream({
        policyId: TOKEN_POLICY_ID,
        assetName: "544b4e",
        amountPerDay: "25"
      })
    ];
    renderExpandedView();

    // 3 whole days at 25 units/day, shown beside the decoded symbol, not ADA.
    expect(screen.getByText("Unpaid now 75 TKN")).toBeInTheDocument();
    expect(screen.getByText("Accrues about 25 TKN per day")).toBeInTheDocument();
    expect(TKN_UNIT).toHaveLength(62);
  });
});
