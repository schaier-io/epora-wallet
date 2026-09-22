import { test } from "vitest";
import assert from "node:assert/strict";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  AdaAmountInput,
  ConfigSection,
  LabeledInputField
} from "./config-form-primitives";

test("ConfigSection renders title, description, and children", () => {
  render(
    <ConfigSection title="Wallet script context" description="Pick an input.">
      <p>child content</p>
    </ConfigSection>
  );

  assert.ok(screen.getByText("Wallet script context"));
  assert.ok(screen.getByText("Pick an input."));
  assert.ok(screen.getByText("child content"));
});

test("ConfigSection omits the description paragraph when none is given", () => {
  const { container } = render(<ConfigSection title="No description" />);
  const paragraphs = container.querySelectorAll("p");
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0]?.textContent, "No description");
});

test("LabeledInputField wires the label to the input and reports edits", () => {
  const edits: string[] = [];
  render(
    <LabeledInputField
      id="withdraw-amount"
      label="Amount"
      value="1000000"
      onChange={(next) => edits.push(next)}
    />
  );

  const input = screen.getByLabelText("Amount");
  assert.equal(input.getAttribute("id"), "withdraw-amount");
  assert.equal(input.getAttribute("value"), "1000000");
});

test("LabeledInputField surfaces the inline error only when present", () => {
  const { rerender } = render(
    <LabeledInputField id="f" label="Field" value="" onChange={() => {}} />
  );
  assert.equal(screen.queryByText("Required"), null);

  rerender(
    <LabeledInputField
      id="f"
      label="Field"
      value=""
      onChange={() => {}}
      error="Required"
    />
  );
  assert.ok(screen.getByText("Required"));
});

test("AdaAmountInput keeps the typed text until the box loses focus", () => {
  // Re-rendering the stored lovelace on every keystroke erased "1." as it was typed.
  const onChange = vi.fn();
  render(<AdaAmountInput aria-label="Amount" value="1500000" onChange={onChange} />);
  const box = screen.getByLabelText("Amount") as HTMLInputElement;
  assert.equal(box.value, "1.5");

  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "1." } });
  assert.equal(box.value, "1.");
  assert.deepEqual(onChange.mock.calls, [["1."]]);

  fireEvent.blur(box);
  assert.equal(box.value, "1.5");
});

test("AdaAmountInput keeps text it cannot parse visible and flagged after blur", () => {
  // Swapping "1,5" for the empty stored value on blur hid the mistake.
  render(<AdaAmountInput aria-label="Amount" value="" onChange={vi.fn()} />);
  const box = screen.getByLabelText("Amount") as HTMLInputElement;
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "1,5" } });
  fireEvent.blur(box);
  assert.equal(box.value, "1,5");
  assert.equal(box.getAttribute("aria-invalid"), "true");

  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "" } });
  fireEvent.blur(box);
  assert.equal(box.value, "");
  assert.equal(box.getAttribute("aria-invalid"), null);
});

test("AdaAmountInput drops text it could not parse when the stored amount moves from outside", () => {
  // A Max button or a "pay now" tick stores a new amount while the box is idle; the
  // leftover "1,5" kept covering it and stayed flagged.
  const view = render(<AdaAmountInput aria-label="Amount" value="" onChange={vi.fn()} />);
  const box = screen.getByLabelText("Amount") as HTMLInputElement;
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "1,5" } });
  fireEvent.blur(box);
  assert.equal(box.value, "1,5");

  view.rerender(<AdaAmountInput aria-label="Amount" value="3000000" onChange={vi.fn()} />);
  assert.equal(box.value, "3");
  assert.equal(box.getAttribute("aria-invalid"), null);
});

test("AdaAmountInput keeps the text being typed while the parent echoes it back", () => {
  const view = render(<AdaAmountInput aria-label="Amount" value="" onChange={vi.fn()} />);
  const box = screen.getByLabelText("Amount") as HTMLInputElement;
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "1," } });
  // The parent stores what it could parse ("" here) and re-renders mid-typing.
  view.rerender(<AdaAmountInput aria-label="Amount" value="1000000" onChange={vi.fn()} />);
  assert.equal(box.value, "1,");
});

test("AdaAmountInput shows a stored amount that changed from outside", () => {
  const view = render(<AdaAmountInput aria-label="Amount" value="" onChange={vi.fn()} />);
  view.rerender(<AdaAmountInput aria-label="Amount" value="2000000" onChange={vi.fn()} />);
  assert.equal((screen.getByLabelText("Amount") as HTMLInputElement).value, "2");
});

test("AdaAmountInput preserves a validation error supplied by its caller", () => {
  render(<AdaAmountInput aria-label="Amount" value="2000000" onChange={vi.fn()} aria-invalid />);
  assert.equal(screen.getByLabelText("Amount").getAttribute("aria-invalid"), "true");
});

// Three of the four call sites pass no error of their own, so when the typed text does not
// parse the box used to flag itself and say nothing: a red border and `aria-invalid`, with
// no message on the screen and none for a screen reader.
test("AdaAmountInput says why it rejected the text it cannot parse", () => {
  render(<AdaAmountInput id="pay-amount" aria-label="Amount" value="" onChange={vi.fn()} />);
  const box = screen.getByLabelText("Amount") as HTMLInputElement;
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "one and a half" } });
  // On blur, not on the keystroke: the test below measures why.
  fireEvent.blur(box);

  const message = screen.getByRole("alert");
  assert.match(message.textContent ?? "", /Enter an ADA amount/);
  assert.equal(box.getAttribute("aria-invalid"), "true");
  assert.equal(box.getAttribute("aria-describedby"), message.getAttribute("id"));
});

test("AdaAmountInput stays quiet while a valid amount is still being typed", () => {
  // `parseAdaToLovelace` rejects the prefixes of a thousands-grouped amount the app
  // itself accepts. Measured: "1"=ok "1,"=INVALID "1,0"=INVALID "1,00"=INVALID
  // "1,000"=ok. Reporting per keystroke turned the box red and named a format error
  // three times on the way to a valid number.
  render(<AdaAmountInput id="pay-amount" aria-label="Amount" value="" onChange={vi.fn()} />);
  const box = screen.getByLabelText("Amount") as HTMLInputElement;
  fireEvent.focus(box);

  for (const typed of ["1", "1,", "1,0", "1,00", "1,000"]) {
    fireEvent.change(box, { target: { value: typed } });
    assert.equal(screen.queryByRole("alert"), null);
    assert.equal(box.getAttribute("aria-invalid"), null);
  }

  // The same text after blur is still judged, so nothing unparseable slips through.
  fireEvent.change(box, { target: { value: "1," } });
  fireEvent.blur(box);
  assert.equal(box.getAttribute("aria-invalid"), "true");
});

test("AdaAmountInput shows no format message once the text parses", () => {
  render(<AdaAmountInput id="pay-amount" aria-label="Amount" value="" onChange={vi.fn()} />);
  const box = screen.getByLabelText("Amount") as HTMLInputElement;
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "1.5" } });

  assert.equal(screen.queryByRole("alert"), null);
  assert.equal(box.getAttribute("aria-invalid"), null);
});
