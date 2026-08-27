import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WealthChart } from "@/components/user/wealth-chart";

const DAY_MS = 24 * 60 * 60 * 1000;
const formatValue = (value: number) => value.toFixed(2);

/**
 * The chart always draws at least the two newest points, because a single dot is not a chart.
 * That fallback used to be invisible: pick 7D on a wallet whose two events are six months
 * apart and the delta still read "over 7D", while the date axis underneath showed a six-month
 * span. The suffix now appears only when the chosen range really does hold the points.
 */
describe("wealth chart", () => {
  const now = Date.now();
  const sixMonthsApart = [
    { timestamp: now - 180 * DAY_MS, value: 10 },
    { timestamp: now - 1 * DAY_MS, value: 40 }
  ];

  it("does not name a range it is not showing", () => {
    render(
      <WealthChart
        series={sixMonthsApart}
        unitLabel="ADA"
        formatValue={formatValue}
        defaultRange="7d"
        title="Wallet"
      />
    );

    expect(screen.queryByText(/over 7D/)).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Wallet 40.00 ADA");
  });

  it("names the range when the range really holds the points", () => {
    render(
      <WealthChart
        series={[
          { timestamp: now - 5 * DAY_MS, value: 10 },
          { timestamp: now - 1 * DAY_MS, value: 40 }
        ]}
        unitLabel="ADA"
        formatValue={formatValue}
        defaultRange="7d"
        title="Wallet"
      />
    );

    expect(screen.getByText(/over 7D/)).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Wallet 40.00 ADA over 7D");
  });

  it("gives the empty state the same height as the chart it replaces", () => {
    render(
      <WealthChart
        series={[{ timestamp: now, value: 10 }]}
        unitLabel="ADA"
        formatValue={formatValue}
        title="Wallet"
      />
    );

    const empty = screen.getByText("Not enough activity in this range to draw a chart yet.");
    expect(empty.className).toContain("h-[180px]");
  });
});
