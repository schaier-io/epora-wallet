import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentActivityTimeline } from "@/components/user/recent-activity-timeline";

const EVENT = {
  id: "tx-1",
  title: "Funds added",
  label: "Top-up",
  amountSummary: "+8 ₳",
  timestampDisplay: "5m ago",
  timestampTooltip: "Jan 12, 14:32 UTC · Slot 1234"
};

/**
 * Each row is one button wrapping four separate strings, and nothing separated them, so the
 * accessible name came out as "Funds addedTop-upSlot 131928483+8 ₳" -- measured in the
 * browser, not guessed. The name is now built from the same four parts with commas, and it
 * uses the visible timestamp rather than the tooltip, so what is announced matches what is
 * on screen.
 */
describe("recent activity timeline", () => {
  it("names a row's parts separately", () => {
    render(<RecentActivityTimeline events={[EVENT]} />);

    expect(
      screen.getByRole("button", { name: "Funds added, Top-up, 5m ago, +8 ₳" })
    ).toBeTruthy();
  });

  it("keeps showing what it has while it refreshes", () => {
    render(<RecentActivityTimeline events={[EVENT]} loading />);

    expect(screen.getByRole("button", { name: /Funds added/ })).toBeTruthy();
    expect(screen.queryByText(/Loading recent activity/)).toBeNull();
  });

  it("says the list is empty rather than showing an empty rail", () => {
    const { container } = render(<RecentActivityTimeline events={[]} />);

    expect(screen.getByText("No activity yet")).toBeTruthy();
    expect(container.querySelector("ol")).toBeNull();
  });
});
