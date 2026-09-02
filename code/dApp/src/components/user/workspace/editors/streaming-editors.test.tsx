import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  FocusedStreamingPaymentRulesEditor,
  ScheduledPaymentEditor,
  StreamingPaymentEditor
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
    // This asserted the Remove button was present and disabled. Removal is not an
    // operation on this path at all: "Existing payments can never be dropped ... an
    // operator stops a payment by rescheduling its `end_date` down to `tx_latest_time`"
    // (`smart-contract/lib/streaming_payments/forwarding.ak:14-30`). A grey button reads
    // as blocked rather than as not-a-thing, so the row says how to stop a payment
    // instead.
    expect(
      screen.queryByRole("button", { name: "Remove scheduled payment" })
    ).not.toBeInTheDocument();
  });

  /**
   * The rate-period picker was one of four selects that carried no focus ring at all: it
   * fell back to the browser outline while the Input beside it in the same flex row drew
   * the app ring, and it had no height, so it sat shorter than that Input.
   */
  it("gives the rate-period picker the app chrome and the row's height", () => {
    const value = createDefaultStateForm();
    value.streamingPayments = [createDefaultStreamingPaymentFormState("7")];
    render(
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

    const picker = screen.getByLabelText("Rate period");
    expect(picker.className).toContain("focus-visible:ring-2");
    expect(picker.className).toContain("h-10");
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

/**
 * A scheduled payment's destination used to get its first check at transaction build
 * time, when `encodePayoutAddressToData` threw. ADA sent to a malformed or wrong-network
 * address is unrecoverable, so the reason now shows on the field itself, the same standard
 * the payout list and the destinations editor already meet.
 */
describe("scheduled payment destination addresses", () => {
  // Real enough for the bech32 parse to succeed, which is what separates "wrong network"
  // from "malformed" in the message the field shows.
  const PREPROD_ADDRESS =
    "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

  function renderScheduledEditor(payoutAddress: string) {
    render(
      <ScheduledPaymentEditor
        streamingPayment={{
          ...createDefaultStreamingPaymentFormState("7"),
          payoutAddress
        }}
        displayIndex={1}
        onChange={() => {}}
        onRemove={() => {}}
      />
    );
    return screen.getByRole("textbox", { name: "Send to address" });
  }

  function renderCreateEditor(payoutAddress: string) {
    render(
      <StreamingPaymentEditor
        streamingPayment={{
          ...createDefaultStreamingPaymentFormState("7"),
          payoutAddress
        }}
        index={0}
        onChange={() => {}}
        onRemove={() => {}}
        existing={false}
      />
    );
    return screen.getByRole("textbox", { name: "Pays to" });
  }

  it("accepts a well-formed preprod address without complaint", () => {
    const input = renderScheduledEditor(PREPROD_ADDRESS);

    expect(input).toBeValid();
    expect(screen.queryByText(/mainnet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not a valid Cardano address/)).not.toBeInTheDocument();
  });

  it("flags a mainnet address as the wrong network while the field is on screen", () => {
    const input = renderScheduledEditor("addr1qxy2k");

    expect(input).toBeInvalid();
    expect(
      screen.getByText(/mainnet address\. This wallet is on Preprod/)
    ).toBeInTheDocument();
    // The message is the input's error description, not just nearby text.
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("flags a malformed testnet address without leaking the bech32 wording", () => {
    renderScheduledEditor("addr_test1_not_a_real_address_zzz");

    expect(screen.getByText(/not a valid Cardano address/)).toBeInTheDocument();
    expect(screen.queryByText(/Unknown letter|checksum/i)).not.toBeInTheDocument();
  });

  it("refuses a reward address, which cannot receive a payment", () => {
    renderScheduledEditor(
      "stake_test1uzamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwc40u6yl"
    );

    expect(screen.getByText(/cannot receive a payment/)).toBeInTheDocument();
  });

  it("stays quiet while the field holds something that is not an address yet", () => {
    const input = renderScheduledEditor("Grandma");

    expect(input).toBeValid();
    expect(screen.queryByText(/valid Cardano address/)).not.toBeInTheDocument();
  });

  it("keeps the same check on the create-payment editor's field", () => {
    const input = renderCreateEditor("addr1qxy2k");

    expect(input).toBeInvalid();
    expect(screen.getByText(/mainnet address\. This wallet is on Preprod/)).toBeInTheDocument();
  });

  it("leaves the create-payment editor's empty field to the submit path", () => {
    const input = renderCreateEditor("");

    expect(input).toBeValid();
    expect(screen.queryByText(/Enter the address/)).not.toBeInTheDocument();
  });
});
