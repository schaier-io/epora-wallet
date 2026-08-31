import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FocusedWalletSettingsEditor } from "./focused-wallet-settings-editor";
import { type StateFormState, createDefaultStateForm } from "@/lib/contracts/state-form";

function timerForm(enabled: boolean): StateFormState {
  const value = createDefaultStateForm();
  value.proofOfLifeUnlockTimeMode = enabled ? "some" : "none";
  value.proofOfLifeIncrementMode = enabled ? "some" : "none";
  value.proofOfLifeUnlockTime = enabled ? "1750000000000" : "";
  value.proofOfLifeIncrement = enabled ? "2592000000" : "";
  return value;
}

function renderTimer(value: StateFormState = timerForm(true)) {
  const onChange = vi.fn();
  return {
    onChange,
    ...render(
      <FocusedWalletSettingsEditor
        value={value}
        onChange={onChange}
        selectedTask="settings-proof-of-life"
        onSelectTask={vi.fn()}
        fieldErrors={{}}
      />
    )
  };
}

function renderRecovery(value: StateFormState = createDefaultStateForm()) {
  const onChange = vi.fn();
  return {
    onChange,
    ...render(
      <FocusedWalletSettingsEditor
        value={value}
        onChange={onChange}
        selectedTask="settings-beneficiaries"
        onSelectTask={vi.fn()}
        fieldErrors={{}}
      />
    )
  };
}

describe("adding a recovery contact", () => {
  it("also adds the required proof-of-life settings", () => {
    for (const buttonIndex of [0, 1]) {
      const view = renderRecovery();
      fireEvent.click(
        screen.getAllByRole("button", { name: "Add recovery contact" })[buttonIndex]!
      );

      const next = view.onChange.mock.calls[0]![0] as StateFormState;
      expect(next.beneficiaries).toHaveLength(1);
      expect(next.proofOfLifeUnlockTimeMode).toBe("some");
      expect(next.proofOfLifeIncrementMode).toBe("some");
      expect(next.proofOfLifeUnlockTime).not.toBe("");
      expect(next.proofOfLifeIncrement).not.toBe("");
      view.unmount();
    }
  });
});

describe("one control for a paired setting", () => {
  /**
   * `expect_valid_settings` (`smart-contract/lib/state/proof_of_life.ak:31-40`) rejects a
   * pair where exactly one of `unlock_time` and `increment` is present. The screen offered
   * a separate None/Some select for each, so a reader could build a wallet the validator
   * will not accept and only learn of it at the receipt.
   */
  it("replaces the two mode selects with a single question", () => {
    renderTimer();

    expect(screen.getByLabelText("Require proof of life")).toBeInTheDocument();
    expect(screen.queryByLabelText("Proof of life Increment Mode")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Proof of life Unlock Time Mode")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Some" })).not.toBeInTheDocument();
  });

  it("sets both halves at once when it is turned on", () => {
    const { onChange } = renderTimer(timerForm(false));

    fireEvent.change(screen.getByLabelText("Require proof of life"), {
      target: { value: "some" }
    });

    const next = onChange.mock.calls[0]![0] as StateFormState;
    expect(next.proofOfLifeUnlockTimeMode).toBe("some");
    expect(next.proofOfLifeIncrementMode).toBe("some");
    expect(next.proofOfLifeUnlockTime.trim()).not.toBe("");
    expect(next.proofOfLifeIncrement.trim()).not.toBe("");
  });

  it("clears both halves at once when it is turned off", () => {
    const { onChange } = renderTimer();

    fireEvent.change(screen.getByLabelText("Require proof of life"), {
      target: { value: "none" }
    });

    const next = onChange.mock.calls[0]![0] as StateFormState;
    expect(next.proofOfLifeUnlockTimeMode).toBe("none");
    expect(next.proofOfLifeIncrementMode).toBe("none");
  });

  it("hides the two values rather than greying them out when the timer is off", () => {
    renderTimer(timerForm(false));

    expect(screen.queryByText("Recovery contacts can claim after")).not.toBeInTheDocument();
    expect(screen.queryByText("Time each check-in buys")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Turn this on so your recovery contacts can claim this wallet if you stop checking in. Without it, they can never act."
      )
    ).toBeInTheDocument();
  });
});

describe("what the fields mean", () => {
  it("says what the deadline does rather than naming the stored field", () => {
    renderTimer();

    expect(screen.getByText("Recovery contacts can claim after")).toBeInTheDocument();
    expect(screen.queryByText("Proof of life Unlock Time")).not.toBeInTheDocument();
    expect(
      screen.getByText("Until this time, only the owners can use this wallet.")
    ).toBeInTheDocument();
  });

  /**
   * `increment` caps one check-in: a renewal must satisfy
   * `updated_unlock_time <= tx_earliest_time + increment` (`proof_of_life.ak:124`). The old
   * helper described the widget instead of the setting.
   */
  it("says what a check-in buys rather than how to type it", () => {
    renderTimer();

    expect(screen.getByText("Time each check-in buys")).toBeInTheDocument();
    expect(screen.queryByText("Proof of life Increment")).not.toBeInTheDocument();
    expect(
      screen.getByText("Checking in moves the date beside this to that far from now, and no further.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Use a human-sized interval instead of typing milliseconds.")
    ).not.toBeInTheDocument();
  });

  it("says what the tab is for before showing any field", () => {
    renderTimer();

    expect(
      screen.getByText(
        "The proof of life is how long you have between check-ins. Let it run out and your recovery contacts can claim what is in this wallet."
      )
    ).toBeInTheDocument();
  });
});

describe("dead chrome", () => {
  /**
   * `FocusedTaskSurface` declares a `stats` prop and has never rendered it. This file's
   * block also carried "Proof of live", the same misspelling that spelled the banned term
   * `proof of life` past `copy-terms.test.ts` in the people editor.
   */
  it("no longer authors a stats block the surface throws away", () => {
    renderTimer();

    expect(screen.queryByText("Proof of live")).not.toBeInTheDocument();
    expect(screen.queryByText("Multisig")).not.toBeInTheDocument();
  });
});
