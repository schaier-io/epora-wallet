import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FocusedStreamingPaymentRulesEditor } from "./streaming-editors";
import { type UserWorkspaceTask } from "@/components/user/flow-types";
import { type StateFormState, createDefaultStateForm } from "@/lib/contracts/state-form";

const ADDRESS = "addr_test1qqexample";

function formWithPayments(ids: string[]): StateFormState {
  const value = createDefaultStateForm();
  value.streamingPayments = ids.map((id) => ({
    id,
    payoutAddress: ADDRESS,
    paidOutAmount: "1500000",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: "1750000000000",
    endDate: "1760000000000"
  }));
  return value;
}

function renderSurface({
  value = formWithPayments([]),
  task = "streaming-payments-add" as UserWorkspaceTask,
  existingIds = [] as string[]
} = {}) {
  const onChange = vi.fn();
  return {
    onChange,
    ...render(
      <FocusedStreamingPaymentRulesEditor
        value={value}
        onChange={onChange}
        selectedTask={task}
        onSelectTask={vi.fn()}
        fieldErrors={{}}
        canPayDue={false}
        existingStreamingPaymentIds={new Set(existingIds)}
      />
    )
  };
}

describe("each tab shows the payments it is about", () => {
  /**
   * Both tabs mapped the whole list, so "Add" showed every live payment and let a reader
   * move an existing one's stop time from the tab that says it adds.
   */
  it("keeps live payments off the add tab", () => {
    renderSurface({ value: formWithPayments(["7"]), existingIds: ["7"] });

    expect(screen.queryByLabelText("Pays to")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing added yet")).toBeInTheDocument();
  });

  it("shows a payment being added on the add tab", () => {
    renderSurface({ value: formWithPayments(["7"]), existingIds: [] });

    expect(screen.getByLabelText("Pays to")).toBeInTheDocument();
    expect(screen.queryByText("Nothing added yet")).not.toBeInTheDocument();
  });

  it("keeps a payment being added off the change tab", () => {
    renderSurface({
      value: formWithPayments(["7"]),
      task: "streaming-payments-edit-renew",
      existingIds: []
    });

    expect(screen.queryByLabelText("Pays to")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing to change")).toBeInTheDocument();
    expect(screen.getByText("Add a payment on the other tab first.")).toBeInTheDocument();
  });

  it("offers the add button only on the add tab", () => {
    renderSurface({ task: "streaming-payments-edit-renew" });

    // Matches both spellings the button has had, so the assertion fails on the code that
    // rendered it on every tab. A bare /add/i would match the tab chip instead.
    expect(
      screen.queryByRole("button", { name: /^Add (a payment|scheduled payment)$/ })
    ).not.toBeInTheDocument();
  });
});

describe("what the screen promises", () => {
  /**
   * The empty state said these payments "send themselves". They do not: somebody has to
   * run the payout, which is why the third tab exists.
   */
  it("does not claim a payment sends itself", () => {
    renderSurface();

    expect(screen.queryByText(/send themselves/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Money builds up for somebody over time, and they collect it later.")
    ).toBeInTheDocument();
  });

  /**
   * `FocusedTaskSurface` declares a `stats` prop and has never rendered it. This was its
   * last caller.
   */
  it("no longer authors a stats block the surface throws away", () => {
    renderSurface();

    expect(screen.queryByText("Payout mode")).not.toBeInTheDocument();
    expect(screen.queryByText("Streaming-payment-only update")).not.toBeInTheDocument();
  });
});

describe("a payment being added", () => {
  /**
   * A new schedule "must be born unsettled" with `paid_out_amount == 0`
   * (`smart-contract/lib/streaming_payments/forwarding.ak:74-83`). The box was editable on
   * exactly that payment, so anything typed guaranteed a rejected transaction.
   */
  it("has no box for a figure the contract fixes at zero", () => {
    renderSurface({ value: formWithPayments(["7"]), existingIds: [] });

    expect(screen.queryByLabelText(/Paid Out Amount/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Paid so far/)).not.toBeInTheDocument();
  });

  it("names the dates by what happens, not by the stored field", () => {
    renderSurface({ value: formWithPayments(["7"]), existingIds: [] });

    expect(screen.getByText("Starts")).toBeInTheDocument();
    expect(screen.getByText("Stops")).toBeInTheDocument();
    expect(screen.queryByText("Start Date")).not.toBeInTheDocument();
    expect(screen.queryByText("End Date")).not.toBeInTheDocument();
    expect(screen.queryByText(/accruing/)).not.toBeInTheDocument();
  });

  it("warns that a monthly figure is kept as a daily one", () => {
    renderSurface({ value: formWithPayments(["7"]), existingIds: [] });

    expect(
      screen.getByText(
        "How much builds up over the period you pick. The wallet keeps a daily figure, so a monthly or yearly amount can round down a little."
      )
    ).toBeInTheDocument();
  });
});

describe("a payment already running", () => {
  it("reports what has been paid instead of offering to change it", () => {
    renderSurface({
      value: formWithPayments(["7"]),
      task: "streaming-payments-edit-renew",
      existingIds: ["7"]
    });

    expect(screen.getByText("Paid so far:")).toBeInTheDocument();
    expect(screen.getByText("1.5 ADA")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Paid Out Amount/)).not.toBeInTheDocument();
  });

  it("says which part of it can still move", () => {
    renderSurface({
      value: formWithPayments(["7"]),
      task: "streaming-payments-edit-renew",
      existingIds: ["7"]
    });

    expect(
      screen.getByText("This payment is already running. You can only change when it stops.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/management may change/)).not.toBeInTheDocument();
  });
});
