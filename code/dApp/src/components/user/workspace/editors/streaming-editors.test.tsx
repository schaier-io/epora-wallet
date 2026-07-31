import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScheduledPaymentEditor } from "./streaming-editors";
import { createDefaultStreamingPaymentFormState } from "@/lib/contracts/state-form";

describe("ScheduledPaymentEditor terminal state", () => {
  it("renders a payee-cancelled schedule as read-only", () => {
    const payment = createDefaultStreamingPaymentFormState("7");
    payment.cancelledAt = { alternative: 0, fields: [123] };
    const { container } = render(
      <ScheduledPaymentEditor
        streamingPayment={payment}
        displayIndex={1}
        onChange={() => {}}
        onRemove={() => {}}
      />
    );

    expect(container.querySelector("fieldset")).toBeDisabled();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove payment" })).toBeDisabled();
  });

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
});
