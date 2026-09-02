import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Recharts from "recharts";
import { WalletBalanceChartSection } from "@/components/user/workspace/wallet-balance-chart-section";

// jsdom measures every element as 0x0, so recharts' ResponsiveContainer renders
// nothing; see wealth-chart.test.tsx for the same arrangement.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof Recharts>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <actual.ResponsiveContainer width={640} height={180}>
        {children as never}
      </actual.ResponsiveContainer>
    )
  };
});

// The section reads atoms directly, so the atom modules become string tokens and
// jotai's reader resolves them from this map -- a stand-in for the whole workspace
// state that a pure view concern should not drag in.
const hoisted = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock("jotai", () => ({
  useAtomValue: (atom: string) => hoisted.values[atom]
}));

vi.mock("@/components/user/workspace/atoms/workspace-transfer-derivations.atoms", () => ({
  wealthSeriesForAssetAtom: "wealthSeriesForAssetAtom",
  availableWealthSeriesForAssetAtom: "availableWealthSeriesForAssetAtom"
}));

vi.mock("@/components/user/workspace/atoms/workspace-wallet-derivations.atoms", () => ({
  activeInferredSttStateFormAtom: "activeInferredSttStateFormAtom",
  totalLockedContractAssetsAtom: "totalLockedContractAssetsAtom"
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

const adaSeries = [
  { timestamp: now - 2 * DAY_MS, value: 4 },
  { timestamp: now - 1 * DAY_MS, value: 9 }
];
const adaAvailable = [
  { timestamp: now - 2 * DAY_MS, value: 0 },
  { timestamp: now - 1 * DAY_MS, value: 5 }
];
const tokenSeries = [
  { timestamp: now - 2 * DAY_MS, value: 2 },
  { timestamp: now - 1 * DAY_MS, value: 7 }
];

const adaStream = {
  id: "1",
  payoutAddress: "addr_test1xyz",
  paidOutAmount: "0",
  policyId: "",
  assetName: "",
  amountPerDay: "1000000",
  startDate: "0",
  endDate: String(10 * DAY_MS)
};

describe("wallet balance chart section", () => {
  // Without this, `screen` keeps matching the first test's still-mounted instance and
  // the pill clicks land on a component whose state no assertion reads.
  afterEach(cleanup);

  beforeEach(() => {
    hoisted.values = {
      wealthSeriesForAssetAtom: (unit: string) =>
        unit === "lovelace" ? adaSeries : tokenSeries,
      availableWealthSeriesForAssetAtom: (unit: string) =>
        unit === "lovelace" ? adaAvailable : tokenSeries,
      totalLockedContractAssetsAtom: [
        { unit: "lovelace", quantity: "9000000" },
        { unit: "746573746f6b656e", quantity: "5" } // hex for "testoken"
      ],
      activeInferredSttStateFormAtom: { streamingPayments: [adaStream] }
    };
  });

  it("offers the wallet's assets as pills and charts ADA by default, named by the legend", () => {
    render(<WalletBalanceChartSection />);

    expect(screen.getByRole("button", { name: "ADA" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "testoken" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
    // The legend names which asset the line is and where it stands: the multi-asset
    // chart has no single headline number to carry that. (The pill row also says ADA.)
    expect(screen.getAllByText("ADA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("9.00 ₳")).toBeInTheDocument();
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Wallet balance/);
  });

  it("adds a token to the same chart instead of replacing the charted series", () => {
    render(<WalletBalanceChartSection />);

    fireEvent.click(screen.getByRole("button", { name: "testoken" }));

    expect(screen.getByRole("button", { name: "ADA" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "testoken" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    // Both lines, each named and valued in its own unit.
    expect(screen.getByText("9.00 ₳")).toBeInTheDocument();
    expect(screen.getByText("7 testoken")).toBeInTheDocument();
  });

  it("does not chart a pill that was unticked away, and never nothing", () => {
    render(<WalletBalanceChartSection />);

    fireEvent.click(screen.getByRole("button", { name: "testoken" }));
    fireEvent.click(screen.getByRole("button", { name: "ADA" }));
    // With two charted, ADA can leave: the token line stays.
    expect(screen.getByRole("button", { name: "ADA" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("7 testoken")).toBeInTheDocument();
    expect(screen.queryByText("9.00 ₳")).not.toBeInTheDocument();

    // testoken is the last line standing: removing it would leave the chart empty, so
    // it stays.
    fireEvent.click(screen.getByRole("button", { name: "testoken" }));
    expect(screen.getByRole("button", { name: "testoken" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByText("7 testoken")).toBeInTheDocument();
  });

  it("carves streaming-payment obligations out while the switch is on", () => {
    render(<WalletBalanceChartSection />);

    // The switch is always present: the reader should not have to know that a stream
    // must exist before the control appears.
    const checkbox = screen.getByRole("checkbox");
    expect(screen.getByText("9.00 ₳")).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("5.00 ₳")).toBeInTheDocument();
    expect(screen.queryByText("9.00 ₳")).not.toBeInTheDocument();
  });

  it("says the switch changes nothing when no charted asset has a stream", () => {
    render(<WalletBalanceChartSection />);

    fireEvent.click(screen.getByRole("button", { name: "testoken" }));
    fireEvent.click(screen.getByRole("button", { name: "ADA" }));
    fireEvent.click(screen.getByRole("button", { name: "testoken" }));

    expect(
      screen.getByText(/No scheduled payment pays the charted assets/)
    ).toBeInTheDocument();
  });

  it("falls back to ADA when a refresh drops the charted token", () => {
    const { rerender } = render(<WalletBalanceChartSection />);
    fireEvent.click(screen.getByRole("button", { name: "testoken" }));
    expect(screen.getByRole("button", { name: "testoken" }).getAttribute("aria-pressed")).toBe(
      "true"
    );

    // The wallet sold out of the token: the pick still names it, but the chart must
    // return to ADA instead of drawing an asset with no pill behind it.
    hoisted.values.totalLockedContractAssetsAtom = [{ unit: "lovelace", quantity: "9000000" }];
    rerender(<WalletBalanceChartSection />);

    expect(screen.queryByRole("button", { name: "testoken" })).toBeNull();
    expect(screen.getByRole("button", { name: "ADA" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("9.00 ₳")).toBeInTheDocument();
  });

  it("does not resurrect a sold token's line when the wallet re-acquires it", () => {
    const { rerender } = render(<WalletBalanceChartSection />);
    fireEvent.click(screen.getByRole("button", { name: "testoken" }));

    // The wallet sells out: the pick is pruned from state, not just from the drawing.
    hoisted.values.totalLockedContractAssetsAtom = [{ unit: "lovelace", quantity: "9000000" }];
    rerender(<WalletBalanceChartSection />);
    expect(screen.queryByRole("button", { name: "testoken" })).toBeNull();

    // The wallet re-acquires the token: it comes back as an unpicked pill. The stale
    // pick was removed, so the line must not silently reappear.
    hoisted.values.totalLockedContractAssetsAtom = [
      { unit: "lovelace", quantity: "9000000" },
      { unit: "746573746f6b656e", quantity: "5" }
    ];
    rerender(<WalletBalanceChartSection />);

    expect(screen.getByRole("button", { name: "testoken" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
    expect(screen.queryByText("7 testoken")).not.toBeInTheDocument();
  });

  it("renders nothing for a wallet without history", () => {
    hoisted.values.wealthSeriesForAssetAtom = () => [];
    const { container } = render(<WalletBalanceChartSection />);
    expect(container).toBeEmptyDOMElement();
  });
});
