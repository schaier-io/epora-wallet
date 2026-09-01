import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("offers the wallet's assets as pills and charts ADA by default", () => {
    render(<WalletBalanceChartSection />);

    expect(screen.getByRole("button", { name: "ADA" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "testoken" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Wallet balance 9\.00 ₳/);
  });

  it("switches the charted series when a token pill is picked", () => {
    render(<WalletBalanceChartSection />);

    fireEvent.click(screen.getByRole("button", { name: "testoken" }));

    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^testoken balance 7/);
    expect(screen.getByRole("button", { name: "testoken" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("carves streaming-payment obligations out only while the switch is on", () => {
    render(<WalletBalanceChartSection />);

    // The ADA stream makes the switch visible on the ADA chart.
    const checkbox = screen.getByRole("checkbox");
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Wallet balance 9\.00 ₳/);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Wallet balance 5\.00 ₳/);
  });

  it("hides the switch when the charted asset has no streams paying it", () => {
    render(<WalletBalanceChartSection />);

    fireEvent.click(screen.getByRole("button", { name: "testoken" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders nothing for a wallet without history", () => {
    hoisted.values.wealthSeriesForAssetAtom = () => [];
    const { container } = render(<WalletBalanceChartSection />);
    expect(container).toBeEmptyDOMElement();
  });
});
