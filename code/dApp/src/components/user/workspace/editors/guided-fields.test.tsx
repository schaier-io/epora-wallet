import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { GuidedDateTimeField, GuidedDurationField, GuidedLockedUtxoSelector } from "./guided-fields";

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

describe("choosing which funds to spend", () => {
  const utxos = [
    {
      input: { txHash: "aa".repeat(32), outputIndex: 0 },
      output: { address: "addr_test1x", amount: [{ unit: "lovelace", quantity: "5000000" }] }
    }
  ];

  function renderSelector() {
    return render(
      <GuidedLockedUtxoSelector
        utxos={utxos as never}
        selectedRefs={[]}
        onChange={vi.fn()}
        onSuggest={vi.fn()}
        helper="Add each fund pool you want to include."
      />
    );
  }

  it("asks the question in words rather than naming the contract state", () => {
    renderSelector();

    expect(screen.getByText("Which funds to spend")).toBeInTheDocument();
    expect(screen.queryByText("Locked funds to use")).not.toBeInTheDocument();
  });

  /** `suggestWalletInputsForRequestedAssets` (`guided-helpers.ts:381`) picks enough pools
   * to cover what is being sent, which "suggested inputs" named neither half of. */
  it("says what the pick-for-me button will do", () => {
    renderSelector();

    expect(
      screen.getByRole("button", { name: "Pick enough for this payment" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select suggested inputs" })
    ).not.toBeInTheDocument();
  });

  it("leads each row with the amount, not the transaction id", () => {
    const { container } = renderSelector();

    const row = container.querySelector("button.w-full")!;
    const lines = [...row.querySelectorAll("p")];
    expect(lines[0]!.className).toContain("text-foreground");
    expect(lines[0]!.textContent).toMatch(/5/);
    expect(lines[1]!.className).toContain("font-mono");
    expect(lines[1]!.textContent).toContain("aa");
  });

  it("says the wallet is empty without calling it unspendable", () => {
    render(
      <GuidedLockedUtxoSelector
        utxos={[]}
        selectedRefs={[]}
        onChange={vi.fn()}
        onSuggest={vi.fn()}
        helper="Add each fund pool you want to include."
      />
    );

    expect(screen.getByText("This wallet has nothing to spend right now.")).toBeInTheDocument();
    expect(screen.queryByText(/No spendable wallet funds/)).not.toBeInTheDocument();
  });

  /**
   * The shared read behind `utxos` can fail. With nowhere to show it, the panel
   * reported the failure as "nothing to spend" and left no way to retry — the same
   * failed-read-as-empty-wallet mistake the tidy screen's browser was corrected for.
   */
  it("reports a failed read instead of an empty wallet, and offers the retry", () => {
    const onRefresh = vi.fn();
    render(
      <GuidedLockedUtxoSelector
        utxos={[]}
        selectedRefs={[]}
        onChange={vi.fn()}
        onSuggest={vi.fn()}
        helper="Add each fund pool you want to include."
        error="Could not reach the chain."
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText("Could not reach the chain.")).toBeInTheDocument();
    expect(
      screen.queryByText("This wallet has nothing to spend right now.")
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh funds" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("offers no refresh while the read has not failed", () => {
    render(
      <GuidedLockedUtxoSelector
        utxos={utxos as never}
        selectedRefs={[]}
        onChange={vi.fn()}
        onSuggest={vi.fn()}
        helper="Add each fund pool you want to include."
      />
    );

    expect(screen.queryByRole("button", { name: "Refresh funds" })).not.toBeInTheDocument();
  });
});
