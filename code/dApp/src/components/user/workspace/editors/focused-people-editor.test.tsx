import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

import { FocusedPeopleEditor } from "./focused-people-editor";
import {
  type StateFormState,
  type UserPreset,
  applyUserPreset,
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";

function formWith(...presets: UserPreset[]): StateFormState {
  const value = createDefaultStateForm();
  value.users = presets.map((preset, index) =>
    applyUserPreset(createDefaultUserFormState(String(index + 1)), preset)
  );
  return value;
}

function renderOwners(
  value: StateFormState = formWith("admin"),
  onChange = vi.fn()
) {
  return {
    onChange,
    ...render(
      <FocusedPeopleEditor
        value={value}
        onChange={onChange}
        selectedTask="people-admins-signers"
        onSelectTask={vi.fn()}
        fieldErrors={{}}
      />
    )
  };
}

describe("what the owners tab says it holds", () => {
  /**
   * The list renders every person, spenders included, because making someone an owner
   * has to be reachable from here. The sentence above it claimed the opposite.
   */
  it("does not claim to show owners only", () => {
    renderOwners(formWith("admin", "limited-withdrawal"));

    expect(screen.queryByText("Edit owner access only.")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Everyone in this wallet\. Change anyone here to an owner/)
    ).toBeInTheDocument();
    expect(screen.getAllByText("Remove")).toHaveLength(2);
  });

  it("says what an empty wallet is missing, not just that it is empty", () => {
    renderOwners(formWith());

    expect(screen.getByText("Nobody can change this wallet")).toBeInTheDocument();
    expect(
      screen.getByText("Add the first owner. An owner can change every wallet setting.")
    ).toBeInTheDocument();
  });
});

describe("approval power", () => {
  /**
   * `multisig_threshold_is_met` (`smart-contract/lib/state/configuration.ak:278-284`)
   * counts a person's power only when it is `Some` AND above zero, so the old
   * "Signer power" badge read the same for 5, for 0, and for a blank box.
   */
  it("shows the number the contract will count", () => {
    const value = formWith("custom");
    value.users[0]!.multiSigPowerMode = "some";
    value.users[0]!.multiSigPower = "5";
    renderOwners(value);

    expect(screen.getByText("Approval power 5")).toBeInTheDocument();
  });

  it("treats a zero and a blank box as no power, the way the contract does", () => {
    for (const power of ["0", ""]) {
      const value = formWith("custom");
      value.users[0]!.multiSigPowerMode = "some";
      value.users[0]!.multiSigPower = power;
      const view = renderOwners(value);

      expect(screen.getByText("No approval power")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("says why the power box is greyed out", () => {
    const value = formWith("custom");
    value.users[0]!.multiSigPowerMode = "none";
    renderOwners(value);

    expect(screen.getByLabelText("Approval power")).toBeDisabled();
    expect(
      screen.getByText("Set Counts toward approvals to Yes to give this person approval power.")
    ).toBeInTheDocument();
  });
});

describe("copy", () => {
  it("names the role rather than the stored preset", () => {
    renderOwners();

    const role = screen.getByLabelText("Role");
    expect(role).toBeInTheDocument();
    expect(screen.queryByLabelText("User Preset")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Owner" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("drops the co-sign jargon", () => {
    renderOwners();

    expect(screen.getByLabelText("Counts toward approvals")).toBeInTheDocument();
    expect(screen.queryByLabelText("Co-sign rule")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Co-sign weight")).not.toBeInTheDocument();
  });

  /**
   * The label read "Can renew proof of live" -- a typo, and the typo is why the term never
   * tripped `copy-terms.test.ts` back when `proof of life` was banned. The ban has since been
   * inverted (`copy-terms.test.ts`), so the spelling is what this guards now: the flag says
   * what the person can do, in the wallet's own words, spelled correctly.
   */
  it("replaces the misspelled liveness flag with the name the wallet already uses", () => {
    renderOwners(formWith("custom"));

    expect(screen.getByText(/Can check in to refresh the proof of life/)).toBeInTheDocument();
    expect(screen.queryByText(/proof of live/i)).not.toBeInTheDocument();
  });

  it("says why an owner's check-in box is locked on", () => {
    const value = formWith("custom");
    value.users[0]!.isAdmin = true;
    value.users[0]!.canRenewProofOfLife = true;
    renderOwners(value);

    expect(screen.getByText("(every owner can)")).toBeInTheDocument();
  });

  it("counts linked wallets, not wallet keys", () => {
    renderOwners();

    expect(screen.getByText("0 linked wallets")).toBeInTheDocument();
    expect(screen.queryByText(/wallet key/)).not.toBeInTheDocument();
  });
});

describe("dead chrome", () => {
  /**
   * `FocusedTaskSurface` declares a `stats` prop and has never rendered it
   * (`task-surface.tsx:159`, unchanged since the first commit). The block this file
   * passed also contradicted the tab badge: it labelled the total headcount "Spenders".
   */
  it("no longer authors a stats block the surface throws away", () => {
    renderOwners(formWith("admin", "limited-withdrawal"));

    expect(screen.queryByText("Wallet links")).not.toBeInTheDocument();
    expect(screen.getByText("1 owner")).toBeInTheDocument();
    expect(screen.getByText("1 spender")).toBeInTheDocument();
  });
});

function renderSpenders(
  value: StateFormState = formWith("limited-withdrawal"),
  onChange = vi.fn()
) {
  return {
    onChange,
    ...render(
      <FocusedPeopleEditor
        value={value}
        onChange={onChange}
        selectedTask="people-spending-users"
        onSelectTask={vi.fn()}
        fieldErrors={{}}
      />
    )
  };
}

describe("adding people", () => {
  it("creates the role named by each focused action", () => {
    const owners = renderOwners(formWith());
    fireEvent.click(screen.getAllByRole("button", { name: "Add owner" })[0]!);
    expect((owners.onChange.mock.calls[0]![0] as StateFormState).users[0]).toMatchObject({
      preset: "admin",
      isAdmin: true
    });
    owners.unmount();

    const spenders = renderSpenders(formWith());
    fireEvent.click(screen.getAllByRole("button", { name: "Add spender" })[0]!);
    expect((spenders.onChange.mock.calls[0]![0] as StateFormState).users[0]).toMatchObject({
      preset: "limited-withdrawal",
      isAdmin: false
    });
  });
});

describe("what the spenders tab says it holds", () => {
  it("does not claim to show spenders only", () => {
    renderSpenders(formWith("limited-withdrawal", "admin"));

    expect(screen.queryByText("Edit spenders only.")).not.toBeInTheDocument();
    expect(
      screen.getByText("Everyone in this wallet, and what each one may spend each day.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Remove")).toHaveLength(2);
  });

  it("does not head an owner's row Spender", () => {
    renderSpenders(formWith("admin"));

    expect(screen.getByText("Person #1")).toBeInTheDocument();
    expect(screen.queryByText(/^Spender · /)).not.toBeInTheDocument();
  });

  it("says what an empty wallet is missing", () => {
    renderSpenders(formWith());

    expect(screen.getByText("Nobody can spend from this wallet yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add a spender, then set how much they may spend each day.")
    ).toBeInTheDocument();
  });
});

describe("the daily limit", () => {
  /**
   * An owner signs on the Admin path (`smart-contract/lib/state/authorization.ak:127`),
   * which never reads `per_day_allowance`. The two allowance editors used to vanish for
   * an owner with nothing said about why.
   */
  it("explains itself away for an owner instead of vanishing", () => {
    renderSpenders(formWith("admin"));

    expect(screen.getByText("Owner: no daily limit")).toBeInTheDocument();
    expect(
      screen.getByText(/An owner spends without a daily limit, so there is none to set/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Daily limit")).not.toBeInTheDocument();
  });

  it("hides the reset time too, since it resets a limit that does not exist", () => {
    const { container } = renderSpenders(formWith("admin"));

    const resetLabel = screen.getByText("Limit resets after");
    expect(resetLabel.closest(".hidden")).not.toBeNull();
    expect(container.querySelector(".hidden")).not.toBeNull();
  });

  it("shows both allowance figures for a spender", () => {
    renderSpenders();

    expect(screen.getByText("Spender")).toBeInTheDocument();
    expect(screen.getByText("Daily limit")).toBeInTheDocument();
    expect(screen.getByText("How much this person can spend each day.")).toBeInTheDocument();
    expect(screen.getByText("Left to spend")).toBeInTheDocument();
    expect(screen.queryByText("Remaining Allowance")).not.toBeInTheDocument();
  });

  /**
   * Nothing runs at the reset time. `remaining_allowance_available_for_use`
   * (`allowance.ak:190-199`) hands back the full limit on the first payment at or after
   * it, and `next_allowance_reset_after_use` (`:222-233`) then pushes it out.
   */
  it("does not describe the reset as a scheduled event", () => {
    renderSpenders();

    expect(screen.getByText("Limit resets after")).toBeInTheDocument();
    expect(screen.queryByText("Next allowance reset")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The first payment made after this time gets the full daily limit again, and sets this time at least a day later."
      )
    ).toBeInTheDocument();
  });
});

describe("spender copy", () => {
  it("names the role, not the stored preset", () => {
    renderSpenders();

    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.queryByLabelText("User Preset")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Spender with a daily limit" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("counts linked wallets here too", () => {
    renderSpenders();

    expect(screen.getByText("0 linked wallets")).toBeInTheDocument();
    expect(screen.queryByText(/wallet key/)).not.toBeInTheDocument();
  });
});

const CONNECTED_KEY_HASH = "ab".repeat(28);

function renderAssignments({
  value = formWith("limited-withdrawal"),
  keyHash = null,
  onChange = vi.fn()
}: {
  value?: StateFormState;
  keyHash?: string | null;
  onChange?: (next: StateFormState) => void;
} = {}) {
  const store = createStore();
  store.set(activePaymentKeyHashAtom, keyHash);
  return {
    onChange,
    ...render(
      <Provider store={store}>
        <FocusedPeopleEditor
          value={value}
          onChange={onChange}
          selectedTask="people-wallet-assignments"
          onSelectTask={vi.fn()}
          fieldErrors={{}}
        />
      </Provider>
    )
  };
}

describe("what a linked wallet is", () => {
  it("says why the tab exists rather than that it edits links", () => {
    renderAssignments();

    expect(screen.queryByText("Edit linked wallets only.")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "A Cardano wallet has to be linked to a person before they can use this smart wallet."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("This person can only use the smart wallet from a Cardano wallet listed here.")
    ).toBeInTheDocument();
  });

  it("says what an empty list costs the person", () => {
    renderAssignments();

    expect(
      screen.getByText("No wallet added yet, so this person cannot do anything.")
    ).toBeInTheDocument();
  });

  /**
   * The button called `addSpendingUser`, which applies the limited-withdrawal preset,
   * while calling itself "Add person". It always made a spender.
   */
  it("names the role the add button actually creates", () => {
    renderAssignments({ value: formWith() });

    expect(screen.queryByRole("button", { name: /Add person/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Add spender/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("Nobody is in this wallet yet")).toBeInTheDocument();
  });
});

describe("filling in a wallet id", () => {
  /**
   * The field holds a payment key hash. `wallet-provider.tsx:183` already stores that
   * value for whoever is signed in, and `action-validation.ts:143` matches against it,
   * so the reader had to find and retype a hash the app already held.
   */
  it("fills the id in from the connected wallet", () => {
    const value = formWith("limited-withdrawal");
    const { onChange } = renderAssignments({ value, keyHash: CONNECTED_KEY_HASH });

    const button = screen.getByRole("button", { name: "Use the wallet I am signed in with" });
    expect(button).toBeEnabled();
    expect(screen.getByText("Adds the id of the wallet you are signed in with.")).toBeInTheDocument();

    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [expect.objectContaining({ wallets: [CONNECTED_KEY_HASH] })]
      })
    );
  });

  it("says why it cannot fill anything in with no wallet connected", () => {
    renderAssignments({ keyHash: null });

    expect(screen.getByRole("button", { name: "Use the wallet I am signed in with" })).toBeDisabled();
    expect(
      screen.getByText("Connect a Cardano wallet to fill this in without typing.")
    ).toBeInTheDocument();
  });

  it("does not offer to add the same wallet twice", () => {
    const value = formWith("limited-withdrawal");
    value.users[0]!.wallets = [CONNECTED_KEY_HASH];
    renderAssignments({ value, keyHash: CONNECTED_KEY_HASH });

    expect(screen.getByRole("button", { name: "Use the wallet I am signed in with" })).toBeDisabled();
    expect(
      screen.getByText("This person already has the wallet you are signed in with.")
    ).toBeInTheDocument();
  });

  it("counts linked wallets on this tab too", () => {
    renderAssignments();

    expect(screen.getByText("0 linked wallets")).toBeInTheDocument();
    expect(screen.queryByText(/wallet key/)).not.toBeInTheDocument();
  });
});
