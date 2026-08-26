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
