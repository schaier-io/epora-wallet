import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  FocusedStreamingPaymentRulesEditor,
  ScheduledPaymentEditor
} from "./streaming-editors";
import {
  createDefaultStateForm,
  createDefaultStreamingPaymentFormState
} from "@/lib/contracts/state-form";

describe("streaming payment edit boundaries", () => {
  it("forwards an existing UpdateState schedule unchanged", () => {
    const payment = createDefaultStreamingPaymentFormState("7");
    const { container } = render(
      <ScheduledPaymentEditor
        streamingPayment={payment}
        displayIndex={1}
        onChange={() => {}}
        onRemove={() => {}}
        readOnly
      />
    );

    expect(container.querySelector("fieldset")).toBeDisabled();
    expect(screen.getByText("Forwarded unchanged")).toBeInTheDocument();
  });

  it("keeps an existing schedule's end date editable on ManageStreamingPayments", () => {
    const payment = createDefaultStreamingPaymentFormState("7");
    const value = createDefaultStateForm();
    value.streamingPayments = [payment];
    const { container } = render(
      <FocusedStreamingPaymentRulesEditor
        value={value}
        onChange={() => {}}
        selectedTask="streaming-payments-edit-renew"
        onSelectTask={() => {}}
        fieldErrors={{}}
        canPayDue={false}
        existingStreamingPaymentIds={new Set(["7"])}
      />
    );

    expect(
      container.querySelector("#streaming-payment-0-start-date-date")
    ).toBeDisabled();
    expect(
      container.querySelector("#streaming-payment-0-end-date-date")
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove scheduled payment" })
    ).toBeDisabled();
  });
});

/**
 * `ui/label.tsx` renders a plain `<label>`, so one without `htmlFor` associates with
 * nothing and the field is announced as "edit text, blank". The ids come from `useId()`
 * rather than the row index because this editor mounts from more than one surface at
 * once, and two lists both starting at 0 would collide.
 */
describe("scheduled payment field labels", () => {
  function renderEditor(id: string) {
    return render(
      <ScheduledPaymentEditor
        streamingPayment={createDefaultStreamingPaymentFormState(id)}
        displayIndex={1}
        onChange={() => {}}
        onRemove={() => {}}
      />
    ).container;
  }

  it("associates every labelled field with its control", () => {
    renderEditor("7");

    expect(screen.getByLabelText("Send to address").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Amount per day (ADA)").tagName).toBe("INPUT");
  });

  it("gives two instances distinct ids", () => {
    const first = renderEditor("7");
    const second = renderEditor("8");

    const idOf = (root: HTMLElement) =>
      root.querySelector<HTMLLabelElement>('label[for$="-send-to"]')?.htmlFor;

    const firstId = idOf(first);
    const secondId = idOf(second);

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    // Each label still points at a control inside its own instance, not the other's.
    expect(first.querySelector(`#${CSS.escape(firstId!)}`)).not.toBeNull();
    expect(second.querySelector(`#${CSS.escape(secondId!)}`)).not.toBeNull();
  });
});
