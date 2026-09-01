import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type * as Recharts from "recharts";
import { WealthChart } from "@/components/user/wealth-chart";

// jsdom measures every element as 0x0, so recharts' ResponsiveContainer renders
// nothing and the chart body cannot be asserted. Giving it a fixed size is the
// standard way round that, and it is the only mock here: the chart itself, its
// scales and its paths are the real library.
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

const DAY_MS = 24 * 60 * 60 * 1000;
const formatValue = (value: number) => value.toFixed(2);

/**
 * The chart always draws at least the two newest points, so the range keeps its context.
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
      <WealthChart series={[]} unitLabel="ADA" formatValue={formatValue} title="Wallet" />
    );

    const empty = screen.getByText("Not enough activity in this range to draw a chart yet.");
    expect(empty.className).toContain("h-[180px]");
  });

  /**
   * A funded-and-untouched wallet can produce exactly one point: its single event has no
   * block time, so the atom places it at render-now and the hold-to-now append has nothing
   * to extend. "Not enough activity" then contradicted the balance on screen a few pixels
   * above, so a lone point now draws as a dot on a padded axis instead.
   */
  it("draws a lone point as a dot instead of refusing", () => {
    const { container } = render(
      <WealthChart
        series={[{ timestamp: now, value: 5 }]}
        unitLabel="ADA"
        formatValue={formatValue}
        title="Wallet"
      />
    );

    expect(screen.queryByText("Not enough activity in this range to draw a chart yet.")).toBeNull();
    expect(container.querySelector(".recharts-surface")).toBeTruthy();
    expect(container.querySelector(".recharts-area-dot")).toBeTruthy();
    // The range pill names a period a single undated point cannot cover.
    expect(screen.queryByText(/over/)).toBeNull();
  });

  it("draws the series with recharts, not a hand-rolled path", () => {
    const { container } = render(
      <WealthChart
        series={sixMonthsApart}
        unitLabel="ADA"
        formatValue={formatValue}
        defaultRange="all"
        title="Wallet"
      />
    );

    // The library is doing the drawing: its own surface, its own area layer, and
    // a path whose geometry it computed from the two points.
    expect(container.querySelector(".recharts-surface")).toBeTruthy();
    const area = container.querySelector(".recharts-area-area");
    expect(area).toBeTruthy();
    expect(area?.getAttribute("d")).toMatch(/^M/);
  });

  it("draws a wallet whose only transaction has been held to now", () => {
    const funded = [
      { timestamp: now - 5 * DAY_MS, value: 40 },
      { timestamp: now, value: 40 }
    ];

    const { container } = render(
      <WealthChart series={funded} unitLabel="ADA" formatValue={formatValue} title="Wallet" />
    );

    expect(screen.queryByText("Not enough activity in this range to draw a chart yet.")).toBeNull();
    expect(container.querySelector(".recharts-surface")).toBeTruthy();
  });
});
