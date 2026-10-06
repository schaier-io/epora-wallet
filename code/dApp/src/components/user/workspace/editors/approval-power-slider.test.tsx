import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Label } from "@/components/ui/label";
import { ApprovalPowerSlider } from "./approval-power-slider";

function renderField(
  props: Partial<React.ComponentProps<typeof ApprovalPowerSlider>> = {}
) {
  const onChange = vi.fn();
  const view = render(
    <ApprovalPowerSlider
      id="power"
      label={<Label id="power-label">Approval power</Label>}
      labelledBy="power-label"
      value="2"
      onChange={onChange}
      min={1}
      max={5}
      {...props}
    />
  );
  return { onChange, ...view };
}

const blocks = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button[aria-hidden='true']"));

describe("the stepper holds the number", () => {
  /** The number has one home: a spinbutton named by the field's label. */
  it("carries the label and stays focusable", () => {
    renderField();

    const stepper = screen.getByRole("spinbutton", { name: "Approval power" });
    expect(stepper).toHaveAttribute("aria-valuenow", "2");
    expect(stepper).toHaveAttribute("aria-valuemin", "1");
    expect(stepper).toHaveAttribute("aria-valuemax", "5");
    expect(stepper).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("steps up and down with its buttons", () => {
    const { onChange } = renderField();

    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease" }));

    expect(onChange.mock.calls).toEqual([["3"], ["1"]]);
  });

  it("switches each button off at its end of the range", () => {
    renderField({ value: "1", max: 2 });
    expect(screen.getByRole("button", { name: "Decrease" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase" })).toBeEnabled();
  });

  it("answers the keyboard like a spinbutton", () => {
    const { onChange } = renderField();
    const stepper = screen.getByRole("spinbutton");

    fireEvent.keyDown(stepper, { key: "ArrowUp" });
    fireEvent.keyDown(stepper, { key: "ArrowDown" });
    fireEvent.keyDown(stepper, { key: "Home" });
    fireEvent.keyDown(stepper, { key: "End" });
    fireEvent.keyDown(stepper, { key: "PageUp" });

    expect(onChange.mock.calls).toEqual([["3"], ["1"], ["1"], ["5"], ["5"]]);
  });

  /**
   * A blank value shows as `min` without being stored. The first step stores
   * the shown number, so the pointer can still set a blank threshold to 1.
   */
  it("stores the shown number on the first step from a blank value", () => {
    const { onChange } = renderField({ value: "" });

    expect(screen.getByRole("button", { name: "Decrease" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));

    expect(onChange).toHaveBeenCalledWith("1");
  });

  it("gives the keyboard the same first step as the buttons", () => {
    const { onChange } = renderField({ value: "" });

    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledWith("1");
  });

  it("offers no step that moves a stored number the wrong way", () => {
    const { onChange } = renderField({ value: "0" });

    expect(screen.getByRole("button", { name: "Decrease" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("names each step button after its field", () => {
    renderField();

    expect(screen.getByRole("button", { name: "Increase" })).toHaveAccessibleDescription(
      "Approval power"
    );
  });

  it("clamps a stored number below the scale", () => {
    renderField({ value: "-4" });

    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuenow", "1");
  });
});

describe("the meter draws one block per unit of power", () => {
  it("fills the blocks up to the number", () => {
    const { container } = renderField({ value: "3" });

    const all = blocks(container);
    expect(all).toHaveLength(5);
    expect(all.filter((block) => block.dataset.filled)).toHaveLength(3);
    expect(all.every((block) => block.tabIndex === -1)).toBe(true);
  });

  it("jumps to a block when clicked", () => {
    const { container, onChange } = renderField();

    fireEvent.click(blocks(container)[3]!);

    expect(onChange).toHaveBeenCalledWith("4");
  });

  /**
   * A stored range can be millions wide. Blocks would be thinner than their
   * gaps and the array would freeze the page, so a long range draws a slider.
   */
  it("draws a slider instead once the range is too long for blocks", () => {
    const { container } = renderField({ value: "3", max: 1_000_000 });

    expect(blocks(container)).toHaveLength(0);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuemax", "1000000");
    // The thumb is a pointer shortcut: named, but out of the tab order.
    const thumb = screen.getByRole("slider", { name: "Approval power" });
    expect(thumb).toHaveAttribute("tabindex", "-1");
  });
});

describe("the stretch where the number is the whole thing there is", () => {
  const hint = "Every co-signer has to approve.";

  it("tints the blocks from that stop on, filled or not", () => {
    const { container } = renderField({ value: "1", fullAt: 3, fullAtHint: hint });

    const zone = blocks(container).map((block) => block.className.includes("brand-warm"));
    expect(zone).toEqual([false, false, true, true, true]);
  });

  it("turns the filled blocks warm once the number is inside", () => {
    const { container: below } = renderField({ value: "2", fullAt: 3, fullAtHint: hint });
    const { container: inside } = renderField({ value: "3", fullAt: 3, fullAtHint: hint });

    expect(blocks(below)[1]!.className).toContain("brand-teal");
    expect(blocks(inside)[2]!.className).toContain("bg-[hsl(var(--brand-warm))]");
  });

  it("explains the stop on its own control, which also jumps to it", () => {
    const { onChange } = renderField({ value: "1", fullAt: 3, fullAtHint: hint });

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("names the stop on a long range too", () => {
    renderField({ value: "1", max: 40, fullAt: 5, fullAtHint: hint });

    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("moves an end label aside rather than printing over it", () => {
    renderField({ value: "1", max: 20, fullAt: 2, fullAtHint: hint });

    const minLabel = screen
      .getAllByText("1")
      .find((element) => element.getAttribute("role") !== "spinbutton");
    expect(minLabel).toHaveClass("invisible");
    expect(screen.getByText("20")).not.toHaveClass("invisible");
  });

  it("draws no tint when the stop is not on the scale", () => {
    const { container } = renderField({ value: "1", fullAt: 0 });

    expect(blocks(container).some((block) => block.className.includes("brand-warm"))).toBe(false);
  });

  it("offers no jump control when the caller has nothing to explain", () => {
    renderField({ value: "1", fullAt: 3 });

    expect(screen.queryByRole("button", { name: "3" })).not.toBeInTheDocument();
  });
});

describe("a stored number the caller's ceiling does not cover", () => {
  /**
   * The ceiling ignores the number this control writes, so it cannot shrink
   * mid-gesture. Widening it here keeps a number loaded from chain readable.
   */
  it("widens the scale to the value it was first handed", () => {
    renderField({ value: "20", max: 5 });

    const stepper = screen.getByRole("spinbutton");
    expect(stepper).toHaveAttribute("aria-valuemax", "20");
    expect(stepper).toHaveAttribute("aria-valuenow", "20");
  });
});

describe("states the number can be in", () => {
  it("marks an unworkable number invalid and points at the sentence that explains it", () => {
    renderField({ invalid: true, describedBy: "why" });

    const stepper = screen.getByRole("spinbutton");
    expect(stepper).toHaveAttribute("aria-invalid", "true");
    expect(stepper).toHaveAttribute("aria-describedby", "why");
  });

  it("says so when the field is switched off", () => {
    const { onChange } = renderField({ disabled: true });
    const stepper = screen.getByRole("spinbutton");

    expect(stepper).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Increase" })).toBeDisabled();
    fireEvent.keyDown(stepper, { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();
  });

  /** One reachable stop is a decoration, not a control. */
  it("shows the number alone when the ends meet", () => {
    renderField({ min: 1, max: 1, value: "1" });

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Approval power")).toHaveTextContent("1");
  });
});

// UX UI-02: importing a large integer must retain an exact repair path.
describe("an exact large value", () => {
  it("shows in a box, not a rounding control", () => {
    const { onChange } = renderField({ value: "18446744073709551615" });

    const value = screen.getByRole("textbox", { name: "Approval power" });
    expect(value).toHaveValue("18446744073709551615");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets the owner lower it", () => {
    const { onChange } = renderField({ value: "18446744073709551615" });

    fireEvent.change(screen.getByRole("textbox", { name: "Approval power" }), {
      target: { value: "2" }
    });

    expect(onChange).toHaveBeenCalledWith("2");
  });
});
