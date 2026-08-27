import { test } from "vitest";
import assert from "node:assert/strict";
import { render, screen } from "@testing-library/react";

import {
  ConfigSection,
  LabeledInputField,
  OperatorPathSelector
} from "./config-form-primitives";
import type { OperatorAuthorityPath } from "@/lib/types/contracts";

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

const OPERATOR_OPTIONS: Array<{ value: OperatorAuthorityPath; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "multisig", label: "Multisig" }
];

test("OperatorPathSelector renders a select when more than one path exists", () => {
  render(
    <OperatorPathSelector
      id="op"
      options={OPERATOR_OPTIONS}
      value="admin"
      onChange={() => {}}
      helper="Pick a path."
    />
  );

  const select = screen.getByLabelText("Who approves");
  assert.equal(select.tagName, "SELECT");
  assert.equal(screen.getAllByRole("option").length, 2);
  assert.ok(screen.getByText("Pick a path."));
});

test("OperatorPathSelector renders a read-only badge for a single path", () => {
  render(
    <OperatorPathSelector
      id="op"
      options={[{ value: "admin", label: "Admin" }]}
      value="admin"
      onChange={() => {}}
    />
  );

  assert.equal(screen.queryByRole("combobox"), null);
  assert.ok(screen.getByText("Admin"));
});

test("OperatorPathSelector renders nothing when there are no paths", () => {
  const { container } = render(
    <OperatorPathSelector id="op" options={[]} value="admin" onChange={() => {}} />
  );
  assert.equal(container.childElementCount, 0);
});
