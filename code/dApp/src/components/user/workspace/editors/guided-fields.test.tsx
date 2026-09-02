import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { GuidedDateTimeField, GuidedDurationField } from "./guided-fields";

describe("a date and time field", () => {
  /**
   * The echo read "Saved as ...". Nothing is saved by typing in a form, and the line's one
   * real job is to say which clock the two boxes are read against.
   */
  it("says which clock the two boxes are read against", () => {
    render(
      <GuidedDateTimeField
        idPrefix="t"
        label="Starts"
        value="1750000000000"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/where you are\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Saved as/)).not.toBeInTheDocument();
  });

  it("asks for both halves when it is empty", () => {
    render(<GuidedDateTimeField idPrefix="t" label="Starts" value="" onChange={vi.fn()} />);

    expect(screen.getByText("Choose both a date and time.")).toBeInTheDocument();
  });

  /**
   * Typing today's date and a time into two browser pickers was the long way round the
   * usual answer ("roughly now"), so the label row carries a small Now button.
   */
  it("fills both halves with the current moment on Now", () => {
    const onChange = vi.fn();
    const before = Date.now();
    render(<GuidedDateTimeField idPrefix="t" label="Starts" value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Now" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const timestamp = Number(onChange.mock.calls[0]![0]);
    // Minute resolution: the pickers take HH:MM, so seconds are truncated.
    expect(Math.abs(timestamp - before)).toBeLessThan(120_000);
    const today = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    expect(
      (screen.getByLabelText("Starts") as HTMLInputElement).value
    ).toBe(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  });

  it("keeps a date picked before its time, even when the stored value was 0", () => {
    // A date alone combines to "", the same as an untouched field. Remounting on
    // every stored-value change threw the date away as soon as it was picked.
    function Harness() {
      const [value, setValue] = useState("0");
      return <GuidedDateTimeField idPrefix="t" label="Starts" value={value} onChange={setValue} />;
    }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-09-02" } });

    // Re-query: a remount would leave the old node detached with its value intact.
    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe("2026-09-02");
  });

  it("clears both halves when the stored value is reset from outside", () => {
    function Harness() {
      const [value, setValue] = useState("1750000000000");
      return (
        <>
          <GuidedDateTimeField idPrefix="t" label="Starts" value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue("")}>
            Reset
          </button>
        </>
      );
    }
    render(<Harness />);
    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe("");
  });

  it("offers no Now button while it is disabled", () => {
    render(
      <GuidedDateTimeField idPrefix="t" label="Starts" value="" onChange={vi.fn()} disabled />
    );

    expect(screen.queryByRole("button", { name: "Now" })).not.toBeInTheDocument();
  });
});

describe("a length-of-time field", () => {
  /** The echo repeated the number and unit already shown in the two controls above it. */
  it("does not echo the two controls back at the reader", () => {
    render(
      <GuidedDurationField idPrefix="d" label="Waits" value="86400000" onChange={vi.fn()} />
    );

    expect(screen.queryByText(/^Saved as/)).not.toBeInTheDocument();
    expect(screen.queryByText("Enter a length of time.")).not.toBeInTheDocument();
  });

  it("asks for a value when it is empty", () => {
    render(<GuidedDurationField idPrefix="d" label="Waits" value="" onChange={vi.fn()} />);

    expect(screen.getByText("Enter a length of time.")).toBeInTheDocument();
  });

  /**
   * `splitDurationMillis` (`lib/user-flow/guided-helpers.ts:230-249`) falls back to
   * milliseconds when no larger unit divides evenly, so the option has to stay reachable
   * or a stored odd value could not be shown at all.
   */
  it("keeps milliseconds available for a value no larger unit divides", () => {
    render(<GuidedDurationField idPrefix="d" label="Waits" value="1234" onChange={vi.fn()} />);

    expect(screen.getByRole("option", { name: "Milliseconds" })).toBeInTheDocument();
    expect((screen.getByLabelText("Waits") as HTMLInputElement).value).toBe("1234");
  });

  it("keeps the unit the person chose while they type", () => {
    // 48 hours stores the same milliseconds as 2 days; re-splitting the stored
    // value flipped the unit to days under the cursor.
    function Harness() {
      const [value, setValue] = useState("");
      return <GuidedDurationField idPrefix="d" label="Waits" value={value} onChange={setValue} />;
    }
    const { container } = render(<Harness />);
    const unit = () => container.querySelector<HTMLSelectElement>("#d-unit")!;
    const amount = () => screen.getByLabelText("Waits") as HTMLInputElement;

    fireEvent.change(unit(), { target: { value: "hours" } });
    fireEvent.change(amount(), { target: { value: "48" } });

    // Re-query: a remount would leave the old nodes detached with their values intact.
    expect(amount().value).toBe("48");
    expect(unit().value).toBe("hours");
  });

  it("does not offer milliseconds for a fresh value", () => {
    render(<GuidedDurationField idPrefix="d" label="Waits" value="" onChange={vi.fn()} />);

    expect(screen.queryByRole("option", { name: "Milliseconds" })).not.toBeInTheDocument();
  });
});
