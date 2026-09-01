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
  enabled = true,
  threshold = "2",
  people = [] as Array<{ power: string; wallets: string[] }>
} = {}): StateFormState {
  const value = createDefaultStateForm();
  value.multiSigThresholdMode = enabled ? "some" : "none";
  value.multiSigThreshold = threshold;
  value.users = people.map((person, index) => ({
    ...createDefaultUserFormState(String(index)),
    multiSigPowerMode: "some" as const,
    multiSigPower: person.power,
    wallets: person.wallets
  }));
  return value;
}

function renderEditor(value: StateFormState) {
  const onChange = vi.fn();
  return { onChange, ...render(<MultisigThresholdEditor value={value} onChange={onChange} />) };
}

describe("what the two controls are called", () => {
  /**
   * The select read "Approval rule" over None/Some, naming neither the rule nor what
   * either choice does.
   */
  it("asks a question instead of naming a contract field", () => {
    renderEditor(formWith());

    expect(screen.getByLabelText("Let several people act together")).toBeInTheDocument();
    expect(screen.queryByLabelText("Approval rule")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Some" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "None" })).not.toBeInTheDocument();
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
});

describe("turning the rule on and off", () => {
  it("fills a working number when it goes on", () => {
    const { onChange } = renderEditor(formWith({ enabled: false, threshold: "" }));

    fireEvent.change(screen.getByLabelText("Let several people act together"), {
      target: { value: "some" }
    });

    const next = onChange.mock.calls[0]![0] as StateFormState;
    expect(next.multiSigThresholdMode).toBe("some");
    expect(next.multiSigThreshold).toBe("2");
  });

  it("keeps a number the reader already typed", () => {
    const { onChange } = renderEditor(formWith({ enabled: false, threshold: "5" }));

    fireEvent.change(screen.getByLabelText("Let several people act together"), {
      target: { value: "some" }
    });

    expect((onChange.mock.calls[0]![0] as StateFormState).multiSigThreshold).toBe("5");
  });

  it("hides the number when the rule is off", () => {
    renderEditor(formWith({ enabled: false }));

    expect(screen.queryByLabelText("Approval power needed")).not.toBeInTheDocument();
    expect(screen.getByText("Only the owners can act for this wallet.")).toBeInTheDocument();
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
    const { onChange } = renderEditor(formWith({ threshold: "2" }));

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
    const value = formWith({ threshold: "2" });
    value.users = [
      {
        ...createDefaultUserFormState("7"),
        multiSigPowerMode: "some" as const,
        multiSigPower: "2",
        wallets: []
      }
    ];
    renderEditor(value);

    // No wallet id yet: the person is named by their id, and their wallet field sits
    // on the row instead of on another page.
    expect(screen.getByText("Co-signer #7")).toBeInTheDocument();
    expect(screen.getByText("Wallets this person signs with")).toBeInTheDocument();
    expect(screen.getByLabelText("Approval power")).toBeInTheDocument();
  });

  it("offers no co-signer section while the rule is off", () => {
    renderEditor(formWith({ enabled: false }));

    expect(screen.queryByRole("button", { name: "Add a co-signer" })).not.toBeInTheDocument();
    expect(screen.queryByText("Co-signers")).not.toBeInTheDocument();
  });
});
