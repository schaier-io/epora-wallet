import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IntegerPowerSlider } from "./integer-power-slider";

function renderSlider(overrides: Partial<Parameters<typeof IntegerPowerSlider>[0]> = {}) {
  const onChange = vi.fn();
  const { container } = render(
    <IntegerPowerSlider
      label="Approval power"
      value="2"
      onChange={onChange}
      max={5}
      {...overrides}
    />
  );
  return {
    onChange,
    container,
    slider: screen.getByLabelText("Approval power")
  };
}

describe("the approval-power slider", () => {
  it("rides the value bubble at the thumb's position", () => {
    // Value 2 on a 1..5 scale sits a quarter of the way up.
    const { container } = renderSlider();
    const bubble = container.querySelector("[data-value-bubble]")!;
    expect(bubble.textContent).toBe("2");
    expect(bubble).toHaveStyle({ left: "25%" });
  });

  it("marks the zone where the person alone reaches the rule", () => {
    const { slider } = renderSlider({ markAt: 2 });

    const zone = slider.parentElement!.querySelector("[data-threshold-zone='reached']")!;
    expect(zone).toHaveStyle({ left: "25%" });
  });

  it("draws no zone while no threshold is set", () => {
    const { slider } = renderSlider();

    expect(
      slider.parentElement!.querySelector("[data-threshold-zone='reached']")
    ).toBeNull();
  });

  it("marks the whole-number stops as ticks", () => {
    const { container } = renderSlider({ max: 4 });

    expect(container.querySelectorAll("[data-tick]")).toHaveLength(4);
  });

  // `max` follows the sum of the co-signers' stored power, and the value follows the
  // stored threshold. Both are integers read from wallet state, so neither is bounded
  // by anything this component controls; one tick per whole number made a stored
  // `1000000` render a million spans.
  it("draws no ticks once the stops are too dense to read", () => {
    const { container, slider } = renderSlider({ value: "1", max: 100_000 });

    expect(container.querySelectorAll("[data-tick]")).toHaveLength(0);
    // The scale itself is untouched: every stored value stays reachable.
    expect(slider).toHaveAttribute("max", "100000");
  });

  it("keeps a stored value reachable even when it sits past max", () => {
    const { slider } = renderSlider({ value: "7", max: 5 });

    expect(slider).toHaveAttribute("max", "7");
  });

  it("hands the chosen whole number back as a string", () => {
    const { onChange, slider } = renderSlider();

    fireEvent.change(slider, { target: { value: "4" } });

    expect(onChange).toHaveBeenCalledWith("4");
  });

  it("paints the thumb by the tone when there is no threshold to mark", () => {
    const { slider } = renderSlider({ tone: "unreachable" });

    expect(slider).toHaveClass("user-power-unreachable");
  });

  it("glows once the chosen value reaches the threshold", () => {
    const { slider } = renderSlider({ markAt: 2, value: "2" });

    expect(slider).toHaveClass("user-power-reaches");
  });
});
