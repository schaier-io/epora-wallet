import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";
import type { WalletInputRef } from "@/lib/types/contracts";

import { GuidedDateTimeField, GuidedDurationField, GuidedLockedUtxoSelector } from "./guided-fields";

describe("a date and time field", () => {
  /**
   * The echo read "Saved as ...". Nothing is saved by typing in a form, and the line's one
   * real job is to say which clock the two boxes are read against.
   *
   * It then read "That is <time> where you are." while rendering `defaultTimeZone`, i.e.
   * it named a zone the number was not in. This field sets when a recovery contact may
   * take the wallet, so the echo has to name the zone it is actually in.
   */
  it("says which clock the two boxes are read against, and names it", () => {
    render(
      <GuidedDateTimeField
        idPrefix="t"
        label="Starts"
        value="1750000000000"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/^That is .*\bUTC\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/where you are/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Saved as/)).not.toBeInTheDocument();
  });

  it("asks for both halves when it is empty, and says which clock they are read on", () => {
    render(<GuidedDateTimeField idPrefix="t" label="Starts" value="" onChange={vi.fn()} />);

    expect(
      screen.getByText("Choose both a date and time. They are read in UTC.")
    ).toBeInTheDocument();
  });

  /**
   * The two inputs were filled through `getTimezoneOffset()`, so they held the runner's
   * own wall clock while the echo under them, and every other rendered timestamp in the
   * app, held `defaultTimeZone`. Pinning both halves to one zone is what makes the echo
   * true. These assertions are absolute, so they only hold if the host zone cannot reach
   * the inputs: run this file under TZ=UTC and TZ=Asia/Tokyo and both must pass.
   */
  it("fills and reads both boxes in the zone the app renders every other time in", () => {
    const onChange = vi.fn();
    render(
      <GuidedDateTimeField
        idPrefix="t"
        label="Starts"
        value="1750000000000"
        onChange={onChange}
      />
    );
    const date = screen.getByLabelText("Starts", { selector: "input" }) as HTMLInputElement;
    const time = screen.getByLabelText("Time of day") as HTMLInputElement;

    // 1750000000000 === 2025-06-15T15:06:40.000Z
    expect(date.value).toBe("2025-06-15");
    expect(time.value).toBe("15:06");

    fireEvent.change(time, { target: { value: "17:00" } });

    expect(onChange).toHaveBeenLastCalledWith(String(Date.parse("2025-06-15T17:00:00Z")));
  });

  /**
   * The reason `defaultTimeZone` is pinned at all (`i18n/config.ts`): the server writes
   * the first HTML and the browser hydrates it. A zone read from the browser makes the
   * two disagree. Nothing in this field reads the host zone any more, so the server
   * string and the hydrated tree are identical and React logs no mismatch.
   *
   * What this cannot see: both passes run in one process on one host zone, so a field
   * that read `Intl.DateTimeFormat().resolvedOptions().timeZone` would render the same
   * string twice and pass here while breaking in a browser whose zone is not the
   * server's. Measured: adding such a read to this component leaves this test green.
   * The guard against that case is that nothing reads the host zone at all, which
   * `lib/user-flow/time-inputs.test.ts` holds by pinning its own host zone off UTC.
   */
  it("hydrates the server markup without a mismatch", () => {
    const element = (
      <GuidedDateTimeField
        idPrefix="t"
        label="Starts"
        value="1750000000000"
        onChange={vi.fn()}
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    // React 19 reports a hydration mismatch through the root's own error callbacks,
    // not through `console.error`. A `console.error` spy here collects nothing and the
    // assertion on it passes even when the two trees differ, so read the callbacks.
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(container, element, {
        onCaughtError: (error) => errors.push(error),
        onUncaughtError: (error) => errors.push(error),
        onRecoverableError: (error) => errors.push(error)
      });
    });
    act(() => {
      root!.unmount();
    });

    expect(errors).toEqual([]);
    expect(container.textContent ?? "").not.toContain("where you are");
  });

  it("keeps a uint64 timestamp visible when it is outside the JavaScript Date range", () => {
    const value = MAX_ON_CHAIN_STATE_INTEGER.toString();

    render(
      <GuidedDateTimeField idPrefix="t" label="Starts" value={value} onChange={vi.fn()} />
    );

    expect(screen.getByText(new RegExp(value))).toBeInTheDocument();
    expect(screen.getByLabelText("Starts", { selector: "input" })).toHaveValue("");
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
    // Both halves are read in `defaultTimeZone`, so Now fills today's UTC date, not the
    // runner's local one. The two differ for part of every day outside UTC.
    expect(
      (screen.getByLabelText("Starts", { selector: "input" }) as HTMLInputElement).value
    ).toBe(new Date(timestamp).toISOString().slice(0, 10));
  });

  it("keeps a date picked before its time, even when the stored value was 0", () => {
    // A date alone combines to "", the same as an untouched field. Remounting on
    // every stored-value change threw the date away as soon as it was picked.
    function Harness() {
      const [value, setValue] = useState("0");
      return <GuidedDateTimeField idPrefix="t" label="Starts" value={value} onChange={setValue} />;
    }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Starts", { selector: "input" }), { target: { value: "2026-09-02" } });

    // Re-query: a remount would leave the old node detached with its value intact.
    expect((screen.getByLabelText("Starts", { selector: "input" }) as HTMLInputElement).value).toBe("2026-09-02");
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
    expect((screen.getByLabelText("Starts", { selector: "input" }) as HTMLInputElement).value).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect((screen.getByLabelText("Starts", { selector: "input" }) as HTMLInputElement).value).toBe("");
  });

  it("offers no Now button while it is disabled", () => {
    render(
      <GuidedDateTimeField idPrefix="t" label="Starts" value="" onChange={vi.fn()} disabled />
    );

    expect(screen.queryByRole("button", { name: "Now" })).not.toBeInTheDocument();
  });
});

describe("a length-of-time field", () => {
  it("does not offer zero for a proof-of-life duration", () => {
    render(<GuidedDurationField idPrefix="d" label="Waits" value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText("Waits", { selector: "input" })).toHaveAttribute("min", "1");
  });

  it("rejects zero typed directly instead of storing an invalid duration", () => {
    const onChange = vi.fn();
    render(<GuidedDurationField idPrefix="d" label="Waits" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Waits", { selector: "input" }), {
      target: { value: "0" }
    });

    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByLabelText("Waits", { selector: "input" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByText("Enter a whole number of 1 or more.")).toBeInTheDocument();
  });

  it("rejects other manual values that are not positive whole numbers", () => {
    const onChange = vi.fn();
    render(<GuidedDurationField idPrefix="d" label="Waits" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Waits", { selector: "input" });

    fireEvent.change(input, { target: { value: "-1" } });
    fireEvent.change(input, { target: { value: "1.5" } });

    expect(onChange).toHaveBeenNthCalledWith(1, "");
    expect(onChange).toHaveBeenNthCalledWith(2, "");
  });

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
   * `splitDurationMillis` (`lib/user-flow/time-inputs.ts`) falls back to
   * milliseconds when no larger unit divides evenly, so the option has to stay reachable
   * or a stored odd value could not be shown at all.
   */
  it("keeps milliseconds available for a value no larger unit divides", () => {
    render(<GuidedDurationField idPrefix="d" label="Waits" value="1234" onChange={vi.fn()} />);

    expect(screen.getByRole("option", { name: "Milliseconds" })).toBeInTheDocument();
    expect((screen.getByLabelText("Waits", { selector: "input" }) as HTMLInputElement).value).toBe("1234");
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
    const amount = () => screen.getByLabelText("Waits", { selector: "input" }) as HTMLInputElement;

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

  /** `suggestWalletInputsForRequestedAssets` (`lib/user-flow/wallet-input-selection.ts`) picks
   * enough pools to cover what is being sent, which "suggested inputs" named neither half of. */
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

  it("allows selecting multiple fund pools and selecting all", () => {
    const twoUtxos = [
      ...utxos,
      {
        input: { txHash: "bb".repeat(32), outputIndex: 1 },
        output: {
          address: "addr_test1x",
          amount: [{ unit: "lovelace", quantity: "6000000" }]
        }
      }
    ];

    function Harness() {
      const [selectedRefs, setSelectedRefs] = useState<WalletInputRef[]>([]);
      return (
        <GuidedLockedUtxoSelector
          utxos={twoUtxos as never}
          selectedRefs={selectedRefs}
          onChange={setSelectedRefs}
          onSuggest={vi.fn()}
          helper="Pick fund pools."
        />
      );
    }

    const { container } = render(<Harness />);
    const rows = [...container.querySelectorAll<HTMLButtonElement>("button.w-full")];

    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
    fireEvent.click(rows[0]!);
    fireEvent.click(rows[1]!);
    expect(
      screen.getByText((_, element) => element?.textContent === "2 fund pools selected.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(
      screen.getByText((_, element) => element?.textContent === "2 fund pools selected.")
    ).toBeInTheDocument();
  });
});

/**
 * Both fields split one question across two controls. The label names only the first, so the
 * second was announced as an unnamed edit field: "Starts, edit" followed by "edit". The
 * comment above the date/time field even claimed the time input carried its own label.
 *
 * The pair is a group named by the visible label now, and the control the label does not
 * reach carries its own name. `toHaveAccessibleName` with no argument asserts a non-empty
 * name, so this holds for any wording.
 */
describe("every control in a split field has a name", () => {
  it("names both halves of a date and time field", () => {
    const { container } = render(
      <GuidedDateTimeField idPrefix="t" label="Starts" value="" onChange={vi.fn()} />
    );

    for (const control of container.querySelectorAll("input, select")) {
      expect(control).toHaveAccessibleName();
    }
    expect(screen.getByRole("group", { name: "Starts" })).toBeInTheDocument();
    expect(screen.getByLabelText("Time of day")).toHaveAttribute("type", "time");
  });

  it("names both halves of a length-of-time field", () => {
    const { container } = render(
      <GuidedDurationField idPrefix="d" label="Waits" value="" onChange={vi.fn()} />
    );

    for (const control of container.querySelectorAll("input, select")) {
      expect(control).toHaveAccessibleName();
    }
    expect(screen.getByRole("group", { name: "Waits" })).toBeInTheDocument();
    expect(screen.getByLabelText("Unit of time").tagName).toBe("SELECT");
  });
});

it("single fund-pool selection replaces the prior input and offers no automatic multi-selection", () => {
  const utxos = [0, 1].map(outputIndex => ({ input: { txHash: "aa".repeat(32), outputIndex }, output: { address: "wallet", amount: [{ unit: "lovelace", quantity: "6000000" }] } }));
  function Harness() {
    const [selectedRefs, onChange] = useState<WalletInputRef[]>([]);
    return <GuidedLockedUtxoSelector utxos={utxos} selectedRefs={selectedRefs} onChange={onChange} selectionMode="single" helper="Select one." />;
  }
  const { container } = render(<Harness />);
  expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pick enough for this payment" })).not.toBeInTheDocument();
  const rows = [...container.querySelectorAll<HTMLButtonElement>("button.w-full")];
  fireEvent.click(rows[0]!);
  fireEvent.click(rows[1]!);
  expect(rows[0]).toHaveAttribute("aria-pressed", "false");
  expect(rows[1]).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(rows[1]!);
  expect(rows[1]).toHaveAttribute("aria-pressed", "false");
});
