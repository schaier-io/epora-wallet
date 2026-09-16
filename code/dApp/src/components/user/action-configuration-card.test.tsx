import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { UserActionConfigurationCard } from "@/components/user/action-configuration-card";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

/**
 * The card header rendered a right-aligned button row and nothing else: the caller passed
 * a real title and the component threw it away with `void title;`. Four badges then stood
 * in for the heading that was never drawn.
 */
const BASE: ComponentProps<typeof UserActionConfigurationCard> = {
  definition: USER_ACTION_DEFINITION_MAP["lock-funds"],
  selectedAction: "lock-funds",
  selectedDetectedToken: false,
  onReset: () => {},
  onClear: () => {},
  compact: true,
  children: <div />
};

describe("action configuration card header", () => {
  it("renders the caller's title as a heading", () => {
    render(<UserActionConfigurationCard {...BASE} title="Add funds details" />);

    expect(screen.getByRole("heading", { name: "Add funds details" })).toBeInTheDocument();
  });

  it("stays silent about risk on a low-risk action", () => {
    render(<UserActionConfigurationCard {...BASE} title="Add funds details" />);

    expect(screen.queryByText("Simple")).not.toBeInTheDocument();
    expect(screen.queryByText("High risk")).not.toBeInTheDocument();
  });

  /**
   * The description rendered only when it ran past 78 characters, and then only inside an info
   * hint. Measured against the catalogue, 14 of the 15 action explanations are shorter than
   * that, so the line that says what the action is was thrown away on all but one of them.
   */
  it("shows the description the caller passed", () => {
    render(
      <UserActionConfigurationCard
        {...BASE}
        title="Add funds details"
        description="This is the normal send flow for this wallet."
      />
    );

    expect(
      screen.getByText("This is the normal send flow for this wallet.")
    ).toBeInTheDocument();
  });

  it("falls back to the action's own description", () => {
    render(<UserActionConfigurationCard {...BASE} title="Add funds details" />);

    expect(
      screen.getByText(USER_ACTION_DEFINITION_MAP["lock-funds"].description)
    ).toBeInTheDocument();
  });

  it("keeps the high-risk warning", () => {
    render(
      <UserActionConfigurationCard
        {...BASE}
        definition={USER_ACTION_DEFINITION_MAP["update-state"]}
        selectedAction="update-state"
        title="Change wallet rules details"
      />
    );

    expect(screen.getByText("High risk")).toBeInTheDocument();
  });

  /**
   * DESIGN.md forbids nested cards. The body nested Card > bordered wrapper > bordered
   * details > bordered tiles, four levels deep. The Card is the one border now.
   */
  it("draws no border inside the card", () => {
    const { container } = render(<UserActionConfigurationCard {...BASE} title="Add funds details" />);

    const card = container.firstElementChild as HTMLElement;
    // Chips are `rounded-full` and keep their border: they are not containers.
    const bordered = Array.from(card.querySelectorAll("*")).filter(
      (node) =>
        /(^|\s)border(\s|$)/.test(node.className) && !node.className.includes("rounded-full")
    );
    expect(bordered.map((node) => node.tagName + "." + node.className)).toEqual([]);
  });

  it("shows only the approval path selected for this action", () => {
    render(
      <UserActionConfigurationCard
        {...BASE}
        definition={USER_ACTION_DEFINITION_MAP["update-state"]}
        selectedAction="update-state"
        approvalLabels={["Owner"]}
      />
    );

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryByText("Co-signers")).not.toBeInTheDocument();
  });

  it("shows the threshold with a selected co-signer path", () => {
    render(
      <UserActionConfigurationCard
        {...BASE}
        definition={USER_ACTION_DEFINITION_MAP["update-state"]}
        selectedAction="update-state"
        approvalLabels={["Co-signers · 2/2 power"]}
      />
    );

    expect(screen.getByText("Co-signers · 2/2 power")).toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });
});

/**
 * "Clear form" wiped the whole draft on one click with no confirm and no undo
 * (issue #415). The header button now only opens a confirm dialog; the caller's
 * `onClear` runs after the reader confirms.
 */
describe("action configuration card clear confirmation", () => {
  function renderCard(onClear: () => void) {
    render(<UserActionConfigurationCard {...BASE} onClear={onClear} title="Add funds details" />);
  }

  it("opens the confirm dialog and does not clear yet", () => {
    const onClear = vi.fn();
    renderCard(onClear);

    fireEvent.click(screen.getByRole("button", { name: "Clear form" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByText(
        "This removes everything you entered in this form. This cannot be undone."
      )
    ).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("keeps the draft when the reader cancels", () => {
    const onClear = vi.fn();
    renderCard(onClear);

    fireEvent.click(screen.getByRole("button", { name: "Clear form" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears the draft when the reader confirms", () => {
    const onClear = vi.fn();
    renderCard(onClear);

    fireEvent.click(screen.getByRole("button", { name: "Clear form" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Clear form" })
    );

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the draft when the reader dismisses the dialog with Escape", () => {
    const onClear = vi.fn();
    renderCard(onClear);

    fireEvent.click(screen.getByRole("button", { name: "Clear form" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
