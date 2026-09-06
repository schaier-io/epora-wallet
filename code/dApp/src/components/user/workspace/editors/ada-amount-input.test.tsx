import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AdaAmountInput } from "@/components/user/workspace/editors/ada-amount-input";

// A real keystroke APPENDS to whatever the box currently holds. `fireEvent.change`
// with a hardcoded full string does not, so it hides a value React rewrote between
// keystrokes, which is exactly the failure these tests exist for.
function typeChar(field: HTMLInputElement, char: string) {
  fireEvent.change(field, { target: { value: field.value + char } });
}

function Harness({ initial = "", ada = true }: { initial?: string; ada?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="probe">Amount</label>
      <AdaAmountInput id="probe" ada={ada} value={value} onChange={setValue} />
      <output data-testid="staged">{value}</output>
    </>
  );
}

function setup(props: { initial?: string; ada?: boolean } = {}) {
  render(<Harness {...props} />);
  return {
    field: screen.getByLabelText("Amount") as HTMLInputElement,
    staged: () => screen.getByTestId("staged").textContent
  };
}

describe("AdaAmountInput", () => {
  it("keeps a decimal point through the keystroke that follows it", () => {
    const { field, staged } = setup();

    typeChar(field, "5");
    expect(field.value).toBe("5");
    typeChar(field, ".");
    // The keystroke that used to be swallowed: the box reformatted "5000000"
    // back to "5" and the dot vanished as it was typed.
    expect(field.value).toBe("5.");
    typeChar(field, "5");

    expect(field.value).toBe("5.5");
    expect(staged()).toBe("5500000");
  });

  it("stages a half-typed amount as the last complete value", () => {
    const { field, staged } = setup();

    typeChar(field, "5");
    typeChar(field, ".");

    expect(staged()).toBe("5000000");
  });

  it("clears the draft when the box is emptied, rather than keeping the old amount", () => {
    const { field, staged } = setup({ initial: "1000000" });

    expect(field.value).toBe("1");
    fireEvent.change(field, { target: { value: "" } });

    expect(field.value).toBe("");
    expect(staged()).toBe("");
  });

  it("re-seeds when the draft is replaced from outside the box", () => {
    function OutsideHarness() {
      const [value, setValue] = useState("1000000");
      return (
        <>
          <label htmlFor="probe">Amount</label>
          <AdaAmountInput id="probe" value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue("7000000")}>
            Max
          </button>
        </>
      );
    }
    render(<OutsideHarness />);
    const field = screen.getByLabelText("Amount") as HTMLInputElement;

    fireEvent.change(field, { target: { value: "2" } });
    expect(field.value).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(field.value).toBe("7");
  });

  it("passes raw token amounts through unconverted", () => {
    const { field, staged } = setup({ ada: false });

    typeChar(field, "4");
    typeChar(field, "2");

    expect(field.value).toBe("42");
    expect(staged()).toBe("42");
  });

  it("keeps the typed text when the caller stores the amount in a coarser unit", () => {
    // A per-week rate is held as an integer per-day rate, so 1 ₳ per week comes
    // back as 0.999999 ₳ per week. That echo must not overwrite what is typed.
    function LossyHarness() {
      const [perDay, setPerDay] = useState("");
      const perWeek = perDay ? (BigInt(perDay) * 7n).toString() : "";
      return (
        <>
          <label htmlFor="probe">Amount</label>
          <AdaAmountInput
            id="probe"
            value={perWeek}
            onChange={(next) => {
              const nextPerDay = next ? (BigInt(next) / 7n).toString() : "";
              setPerDay(nextPerDay);
              return nextPerDay ? (BigInt(nextPerDay) * 7n).toString() : "";
            }}
          />
          <output data-testid="per-day">{perDay}</output>
        </>
      );
    }
    render(<LossyHarness />);
    const field = screen.getByLabelText("Amount") as HTMLInputElement;

    typeChar(field, "1");

    expect(field.value).toBe("1");
    expect(screen.getByTestId("per-day").textContent).toBe("142857");
  });
});
