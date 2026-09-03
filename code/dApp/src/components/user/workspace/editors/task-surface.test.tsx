import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarPlus2, Repeat } from "lucide-react";

import { FocusedTaskSurface, TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";

const TASKS = [
  {
    id: "streaming-payments-add" as const,
    group: "streamingPayments" as const,
    label: "Add a scheduled payment",
    shortLabel: "Add",
    description: "Create a scheduled payment.",
    icon: CalendarPlus2,
    intent: "manage-streaming-payments" as const,
    action: "manage-streaming-payments" as const
  },
  {
    id: "streaming-payments-pay-due" as const,
    group: "streamingPayments" as const,
    label: "Pay due",
    shortLabel: "Pay",
    description: "Pay what a scheduled payment owes.",
    icon: Repeat,
    intent: "pay-streaming-payments" as const,
    action: "payout-streaming-payment" as const
  }
];

function renderSurface(extra: Record<string, unknown> = {}) {
  return render(
    <FocusedTaskSurface
      title="Scheduled payments"
      description="Short enough to render."
      icon={Repeat}
      tasks={TASKS}
      selectedTask="streaming-payments-add"
      onSelectTask={vi.fn()}
      badgeByTask={{ "streaming-payments-add": "Create" }}
      {...extra}
    >
      <p>content</p>
    </FocusedTaskSurface>
  );
}

describe("a tab a reader cannot use", () => {
  /**
   * A disabled chip was 45% opacity and nothing else, and a disabled button is not
   * focusable, so assistive tech could not reach it to ask why either.
   */
  it("carries the reason it is off", () => {
    renderSurface({
      disabledTaskIds: ["streaming-payments-pay-due"],
      disabledReasonByTask: {
        "streaming-payments-pay-due": "Add a scheduled payment first. There is nothing to pay out yet."
      }
    });

    const chip = screen.getByRole("button", {
      name: "Pay due. Add a scheduled payment first. There is nothing to pay out yet."
    });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute(
      "title",
      "Pay due. Add a scheduled payment first. There is nothing to pay out yet."
    );
  });

  it("says nothing extra when the tab is available", () => {
    renderSurface({
      disabledReasonByTask: {
        "streaming-payments-pay-due": "Add a scheduled payment first. There is nothing to pay out yet."
      }
    });

    expect(screen.getByRole("button", { name: "Pay due" })).toBeEnabled();
  });
});

describe("a tab chip's accessible name", () => {
  /** The visible text is a truncated shortLabel plus a badge, so the name was a fragment. */
  it("spells out the full label and what the badge says", () => {
    renderSurface();

    expect(
      screen.getByRole("button", { name: "Add a scheduled payment. Create" })
    ).toBeInTheDocument();
  });
});

describe("radius rungs", () => {
  /**
   * Both blocks sit as siblings of the `rounded-lg` header panel, among editors that are
   * all `rounded-lg`. At `rounded-xl` (14px) they were one rung wider than everything
   * beside them.
   */
  it("puts the empty state on the same rung as its siblings", () => {
    const { container } = render(
      <TaskEmptyState icon={Repeat} title="Nothing yet" description="Short." />
    );

    const block = container.firstElementChild!;
    expect(block.className).toContain("rounded-lg");
    expect(block.className).not.toContain("rounded-xl");
  });

  it("puts the no-owner callout on the same rung as its siblings", () => {
    const { container } = render(
      <ZeroAdminConfirmationCallout adminCount={0} onZeroAdminConfirmedChange={vi.fn()} />
    );

    const block = container.firstElementChild!;
    expect(block.className).toContain("rounded-lg");
    expect(block.className).not.toContain("rounded-xl");
  });
});

/**
 * Which chip was open was said in colour alone. Every chip names itself, so a screen reader
 * did not hear identical buttons, but it heard none of them called the current one. On screen
 * the open chip was a lighter border, a lighter fill and a lighter label: `--primary` is
 * `oklch(0.922 0 0)` in the only theme this app ships, so there was no second cue underneath
 * the lightness step for anyone who could not read it.
 */
describe("which task chip is open", () => {
  it("says so to a screen reader", () => {
    renderSurface();

    expect(screen.getByRole("button", { name: /Add a scheduled payment/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("claims nothing about the chips that are not open", () => {
    renderSurface();

    expect(screen.getByRole("button", { name: /Pay due/ })).not.toHaveAttribute("aria-current");
  });

  /**
   * A task can be the open one and unavailable at the same time: `resolvedSelectedTaskAtom`
   * pins the pay-due task for the payout intent whatever the capability says, and
   * `guidedStreamingPaymentsDisabledTasks` disables that same id while
   * `canPayStreamingPayments` is false. The panel below still belongs to it, so it is still
   * the current one; being unavailable is not what decides that, either way round.
   */
  it("still calls the open chip current while it is unavailable", () => {
    renderSurface({
      selectedTask: "streaming-payments-pay-due",
      disabledTaskIds: ["streaming-payments-pay-due"]
    });

    const open = screen.getByRole("button", { name: /Pay due/ });
    expect(open).toBeDisabled();
    expect(open).toHaveAttribute("aria-current", "true");
  });

  it("does not call an unavailable chip current on its own account", () => {
    renderSurface({ disabledTaskIds: ["streaming-payments-pay-due"] });

    expect(screen.getByRole("button", { name: /Pay due/ })).not.toHaveAttribute("aria-current");
  });

  it("marks no chip while no task is open", () => {
    renderSurface({ selectedTask: null });

    for (const chip of screen.getAllByRole("button")) {
      expect(chip).not.toHaveAttribute("aria-current");
    }
  });

  /**
   * Weight is the cue that is not a colour value. Every other difference between an open chip
   * and a closed one is a step in lightness.
   */
  it("carries a difference that is not a colour", () => {
    renderSurface();

    const open = screen.getByText("Add");
    const closed = screen.getByText("Pay");
    expect(open.className).toContain("font-semibold");
    expect(closed.className).toContain("font-medium");
    expect(closed.className).not.toContain("font-semibold");
  });

  /**
   * The halo is the other cue that is not a lightness step alone: a closed chip has none at
   * all. The mix is what makes it visible, not the width, so both are pinned here. At the old
   * 18% it was reported to measure 1.5:1 against the panel behind it, against the 3:1 WCAG
   * 1.4.11 asks of a cue like this one.
   */
  it("keeps the open chip's halo strong enough to see", () => {
    renderSurface();

    const open = screen.getByRole("button", { name: /Add a scheduled payment/ });
    const closed = screen.getByRole("button", { name: /Pay due/ });
    expect(open.className).toContain(
      "shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
    );
    expect(closed.className).not.toContain("shadow-[");
  });
});
