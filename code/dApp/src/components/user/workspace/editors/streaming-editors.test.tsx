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
      screen.getByRole("button", { name: "Remove streaming payment" })
    ).toBeDisabled();
  });
});
