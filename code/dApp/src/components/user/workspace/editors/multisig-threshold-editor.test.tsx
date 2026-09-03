import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MultisigThresholdEditor } from "./people-editors";
import {
  type StateFormState,
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";

const WALLET = "ab".repeat(28);

function formWith({
  threshold = "2",
  people = [{ power: "1", wallets: [WALLET] }]
} = {}): StateFormState {
  const value = createDefaultStateForm();
  value.multiSigThreshold = threshold;
  value.users = people.map((person, index) => ({
    ...createDefaultUserFormState(String(index)),
    multiSigPowerMode: "some" as const,
    multiSigPower: person.power,
    wallets: person.wallets
  }));
  // The rule is whoever holds a Co-signer chip, so the mode is derived, never set.
  value.multiSigThresholdMode = people.length > 0 ? "some" : "none";
  return value;
}

function renderEditor(value: StateFormState) {
  const onChange = vi.fn();
  return { onChange, ...render(<MultisigThresholdEditor value={value} onChange={onChange} />) };
}

describe("what the controls are called", () => {
  /**
   * The rule used to be a Yes/No over a None/Some pair that could disagree with the
   * Co-signer chips it was supposedly summarising. The chips are the rule now, so
   * there is no switch at all — the heading states the topic and the sentence under
   * it states the derived answer.
   */
  it("has no on/off switch: the Co-signer chips are the rule", () => {
    renderEditor(formWith());

    expect(screen.getByText("Let several people act together")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Yes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "No" })).not.toBeInTheDocument();
  });

  /**
   * `multisig_threshold_is_met` (`smart-contract/lib/state/configuration.ak:272-296`)
   * sums each signer's `multi_sig_power`. It never counts people, so "Required approvals"
   * named the wrong unit.
   */
  it("names the unit the contract actually sums", () => {
    renderEditor(formWith());

    expect(screen.getByLabelText("Approval power needed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Required approvals")).not.toBeInTheDocument();
  });

  /**
   * `OperatorPath` is `Admin` OR `Multisig` (`types.ak:61-64`), and "Admins always
   * satisfy `has_operator_authority(_, _, Admin)`" (`authorization.ak:21`). The rule adds
   * a way in; it never gates an owner. The screen used to say "Require".
   */
  it("does not claim the rule holds an owner back", () => {
    renderEditor(formWith());

    expect(
      screen.getByText(
        "People holding enough approval power between them can act. An owner can still act alone."
      )
    ).toBeInTheDocument();
  });
});

describe("the rule with no co-signers", () => {
  /**
   * "Only the owners can act" used to be the "No" answer with a dead end: nothing on
   * the screen said how to change it. Now the state explains itself and carries the
   * one control that turns the rule on.
   */
  it("says owners-only and offers the add that turns the rule on", () => {
    renderEditor(formWith({ threshold: "", people: [] }));

    expect(screen.getByText("Only the owners can act for this wallet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nobody holds a Co-signer chip yet, so only the owners can act. Add a co-signer to turn the rule on."
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Approval power needed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a co-signer" })).toBeInTheDocument();
  });

  it("turns the rule on from the add, sized to the chip just granted", () => {
    const { onChange } = renderEditor(formWith({ threshold: "", people: [] }));

    fireEvent.click(screen.getByRole("button", { name: "Add a co-signer" }));

    const next = onChange.mock.calls[0]![0] as StateFormState;
    expect(next.multiSigThresholdMode).toBe("some");
    // The new person holds power 1, so "all of them together" is 1 — not a number
    // nobody can reach.
    expect(next.multiSigThreshold).toBe("1");
  });

  it("shows no co-signer list while nobody holds a chip", () => {
    renderEditor(formWith({ threshold: "", people: [] }));

    expect(screen.queryByText("Co-signers")).not.toBeInTheDocument();
  });
});

describe("a threshold nobody can reach", () => {
  /**
   * A threshold above the reachable power is accepted on-chain while an owner exists, and
   * the approval path then grants nothing (`configuration.ak:16-24`). Nothing else in the
   * app says so.
   */
  it("says so when the number is above the power that can sign", () => {
    renderEditor(
      formWith({ threshold: "9", people: [{ power: "2", wallets: [WALLET] }] })
    );

    expect(
      screen.getByText(
        "Nobody can reach 9. The people who can sign hold 2 approval power between them, so no action would ever be approved. Give somebody more approval power, or ask for less."
      )
    ).toBeInTheDocument();
  });

  /**
   * `has_reachable_access_path` counts power only from people who have a wallet to sign
   * with (`configuration.ak:302-311`), so power on a person with no wallet is not power.
   */
  it("ignores power held by somebody with no wallet", () => {
    renderEditor(
      formWith({
        threshold: "2",
        people: [
          { power: "2", wallets: [] },
          { power: "1", wallets: [WALLET] }
        ]
      })
    );

    expect(screen.getByText(/Nobody can reach 2\./)).toBeInTheDocument();
    expect(screen.getByText(/hold 1 approval power between them/)).toBeInTheDocument();
  });

  it("reports the reachable total when the number can be met", () => {
    renderEditor(
      formWith({
        threshold: "2",
        people: [
          { power: "2", wallets: [WALLET] },
          { power: "1", wallets: [WALLET] }
        ]
      })
    );

    expect(
      screen.getByText(
        "This adds up approval power, not people. The people who can sign hold 3 between them."
      )
    ).toBeInTheDocument();
  });

  /** `required_power > 0` rejects a vacuous pass (`configuration.ak:292`). */
  it("rejects zero and blank as a rule that can never pass", () => {
    renderEditor(formWith({ threshold: "0" }));

    expect(
      screen.getByText("Enter at least 1, or no action can ever be approved this way.")
    ).toBeInTheDocument();
  });
});

describe("adding a co-signer in place", () => {
  /**
   * The unreachable-threshold warning used to be a dead end: the people who would close
   * the gap live on the People page, which nothing on this editor named.
   */
  it("offers the add right under the warning, sized to cover the shortfall", () => {
    const { onChange } = renderEditor(formWith({ threshold: "2", people: [] }));

    fireEvent.click(screen.getByRole("button", { name: "Add a co-signer" }));

    const added = (onChange.mock.calls[0]![0] as StateFormState).users.at(-1)!;
    expect(added.multiSigPowerMode).toBe("some");
    // The contract sums power, so one person holding 2 meets a threshold of 2.
    expect(added.multiSigPower).toBe("2");
  });

  it("adds only what the existing signers are short of the threshold", () => {
    const { onChange } = renderEditor(
      formWith({ threshold: "5", people: [{ power: "2", wallets: [WALLET] }] })
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a co-signer" }));

    const added = (onChange.mock.calls[0]![0] as StateFormState).users.at(-1)!;
    expect(added.multiSigPower).toBe("3");
  });

  it("gives each co-signer a row with a wallet field, so the warning can clear here", () => {
    const value = formWith({
      threshold: "2",
      people: [{ power: "2", wallets: [] }]
    });
    renderEditor(value);

    // No wallet id yet: the person is named by their id, and their wallet field sits
    // on the row instead of on another page.
    expect(screen.getByText("Co-signer #0")).toBeInTheDocument();
    expect(screen.getByText("Wallets this person signs with")).toBeInTheDocument();
    expect(screen.getByLabelText("Approval power")).toBeInTheDocument();
  });
});
