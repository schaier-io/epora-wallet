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

    const row = screen.getByRole("button", {
      name: "Top-up, Funds added, 5m ago, +8 ₳"
    });

    expect(row.textContent).toBe("Top-upFunds added5m ago+8 ₳");
  });

  it("keeps showing what it has while it refreshes", () => {
    render(<RecentActivityTimeline events={[EVENT]} loading />);

    expect(screen.getByRole("button", { name: /Funds added/ })).toBeTruthy();
    expect(screen.queryByText(/Loading recent activity/)).toBeNull();
  });

  /**
   * The row chevron rested at `text-muted-foreground/0`, fully transparent, so no row
   * showed one and hover was the only cue that a row is a button.
   */
  it("shows the row chevron before the pointer arrives", () => {
    const { container } = render(<RecentActivityTimeline events={[EVENT]} />);

    const chevron = container.querySelector("svg.lucide-chevron-right");
    expect(chevron).not.toBeNull();
    expect(chevron?.getAttribute("class")).not.toContain("text-muted-foreground/0 ");
    expect(chevron?.getAttribute("class")).toContain("text-muted-foreground/50");
  });

  it("says the list is empty rather than showing an empty rail", () => {
    const { container } = render(<RecentActivityTimeline events={[]} />);

    expect(screen.getByText("No activity yet")).toBeTruthy();
    expect(container.querySelector("ol")).toBeNull();
  });

  it("reports a failed read instead of claiming there is no activity", () => {
    render(<RecentActivityTimeline events={[]} error="Couldn't load recent wallet activity." />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load recent wallet activity.");
    // An error, so danger red (DESIGN.md), the same as the Activity tab shows it.
    expect(screen.getByRole("alert").className).toContain("rose");
    expect(screen.queryByText("No activity yet")).toBeNull();
  });

  it("keeps the rows it has when a later refresh fails", () => {
    render(<RecentActivityTimeline events={[EVENT]} error="Couldn't load recent wallet activity." />);

    expect(screen.getByRole("button", { name: /Funds added/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
