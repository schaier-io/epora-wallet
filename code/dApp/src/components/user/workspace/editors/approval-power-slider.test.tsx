import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Label } from "@/components/ui/label";
import { ApprovalPowerSlider } from "./approval-power-slider";

function renderField(
  props: Partial<React.ComponentProps<typeof ApprovalPowerSlider>> = {}
) {
  const onChange = vi.fn();
  render(
    <>
      <Label id="power-label">Approval power</Label>
      <ApprovalPowerSlider
        id="power"
        labelledBy="power-label"
        value="2"
        onChange={onChange}
        min={1}
        max={5}
        {...props}
      />
    </>
  );
  return onChange;
}

describe("the slider is the whole control", () => {
  /**
   * There is no second box holding the same number, so the slider itself has to
   * carry the field's name and be reachable from the keyboard.
   */
  it("carries the label and stays focusable", () => {
    renderField();

    const slider = screen.getByLabelText("Approval power");
    expect(slider).toHaveAttribute("role", "slider");
    expect(slider).toHaveAttribute("aria-valuenow", "2");
    expect(slider).not.toHaveAttribute("tabindex", "-1");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("reads out the current value without a second control", () => {
    renderField({ min: 0, max: 40, value: "14" });

    const slider = screen.getByLabelText("Approval power");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "40");
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("clamps a stored number below the scale", () => {
    renderField({ value: "-4" });

    expect(screen.getByLabelText("Approval power")).toHaveAttribute("aria-valuenow", "1");
  });
});

describe("the stretch where the number is the whole thing there is", () => {
  function renderWithFull(value: string) {
    return render(
      <>
        <Label id="m-label">Approval power needed</Label>
        <ApprovalPowerSlider
          id="m"
          labelledBy="m-label"
          value={value}
          onChange={() => undefined}
          min={1}
          max={5}
          fullAt={3}
          fullAtHint="Every co-signer has to approve."
        />
      </>
    );
  }

  /**
   * Half a step early on purpose: starting the shading on the stop itself would
   * leave nothing to see until the thumb was already inside it.
   */
  it("shades from halfway between the stop before it and the stop itself", () => {
    const { container } = renderWithFull("1");

    // min 1, max 5, shading starts at 2.5 -> (2.5 - 1) / 4 = 37.5%.
    const zone = container.querySelector<HTMLElement>("span[aria-hidden='true'][style*='left']");
    expect(zone?.style.left).toBe("37.5%");
  });

  it("draws no shading when the stop is not on the scale", () => {
    const { container } = render(
      <>
        <Label id="n-label">Approval power needed</Label>
        <ApprovalPowerSlider
          id="n"
          labelledBy="n-label"
          value="1"
          onChange={() => undefined}
          min={1}
          max={5}
          fullAt={0}
        />
      </>
    );

    expect(container.querySelector("span[aria-hidden='true'][style*='left']")).toBeNull();
  });

  it("explains the stop on its own control, which also jumps to it", () => {
    const onChange = vi.fn();
    render(
      <>
        <Label id="h-label">Approval power needed</Label>
        <ApprovalPowerSlider
          id="h"
          labelledBy="h-label"
          value="1"
          onChange={onChange}
          min={1}
          max={5}
          fullAt={3}
          fullAtHint="Every co-signer has to approve."
        />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("keeps the stop on the scale when the scale collapses to its ends", () => {
    render(
      <>
        <Label id="w-label">Approval power needed</Label>
        <ApprovalPowerSlider
          id="w"
          labelledBy="w-label"
          value="1"
          onChange={() => undefined}
          min={1}
          max={40}
          fullAt={5}
          fullAtHint="Every co-signer has to approve."
        />
      </>
    );

    // A 40-stop scale prints only its ends, but the shaded band needs its name.
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("recolours the thumb once the value is inside the stretch", () => {
    const { container: below } = renderWithFull("2");
    const { container: inside } = renderWithFull("3");

    const thumbClass = (root: HTMLElement) =>
      root.querySelector('[role="slider"]')!.className;

    expect(thumbClass(below)).toContain("border-[hsl(var(--brand-teal))]");
    expect(thumbClass(below)).not.toContain("border-[hsl(var(--brand-warm))]");
    expect(thumbClass(inside)).toContain("border-[hsl(var(--brand-warm))]");
  });

  it("offers no such control when the caller has nothing to explain", () => {
    render(
      <>
        <Label id="q-label">Approval power needed</Label>
        <ApprovalPowerSlider
          id="q"
          labelledBy="q-label"
          value="1"
          onChange={() => undefined}
          min={1}
          max={5}
          fullAt={3}
        />
      </>
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("a stored number the caller's ceiling does not cover", () => {
  /**
   * The ceiling ignores the number this slider writes, so it cannot shrink
   * mid-drag. Widening it here is what keeps a number loaded from chain
   * readable.
   */
  it("widens the scale to the value it was first handed", () => {
    render(
      <>
        <Label id="s-label">Approval power needed</Label>
        <ApprovalPowerSlider
          id="s"
          labelledBy="s-label"
          value="20"
          onChange={() => undefined}
          min={1}
          max={5}
        />
      </>
    );

    const slider = screen.getByLabelText("Approval power needed");
    expect(slider).toHaveAttribute("aria-valuemax", "20");
    expect(slider).toHaveAttribute("aria-valuenow", "20");
  });
});

describe("states the number can be in", () => {
  it("marks an unworkable number invalid and points at the sentence that explains it", () => {
    renderField({ invalid: true, describedBy: "why" });

    const slider = screen.getByLabelText("Approval power");
    expect(slider).toHaveAttribute("aria-invalid", "true");
    expect(slider).toHaveAttribute("aria-describedby", "why");
  });

  it("says so when the field is switched off", () => {
    renderField({ disabled: true });

    expect(screen.getByLabelText("Approval power")).toHaveAttribute("aria-disabled", "true");
  });

  /** One reachable stop is a decoration, not a control. */
  it("shows the number alone when the ends meet", () => {
    renderField({ min: 1, max: 1, value: "1" });

    expect(screen.queryByRole("slider", { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Approval power")).toHaveTextContent("1");
  });
});
