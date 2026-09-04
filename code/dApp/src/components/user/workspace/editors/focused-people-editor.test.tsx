import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { resolvedWalletAddressesAtom } from "@/providers/wallet-address-book";

import { FocusedPeopleEditor } from "./focused-people-editor";
import {
  type StateFormState,
  type UserFormState,
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";

function person(overrides: Partial<UserFormState>, id = "1"): UserFormState {
  return { ...createDefaultUserFormState(id), ...overrides };
}

function formWithUsers(...users: UserFormState[]): StateFormState {
  const value = createDefaultStateForm();
  value.users = users;
  return value;
}

function renderPeople(value: StateFormState = formWithUsers(person({})), onChange = vi.fn()) {
  const store = createStore();
  store.set(activePaymentKeyHashAtom, "dd".repeat(28));
  return {
    onChange,
    ...render(
      <Provider store={store}>
        <FocusedPeopleEditor
          value={value}
          onChange={onChange}
          fieldErrors={{}}
        />
      </Provider>
    )
  };
}

function chip(name: string) {
  return screen.getByRole("button", { name });
}

describe("one roster, not three tabs", () => {
  it("renders every person once with their permissions as chips", () => {
    renderPeople(
      formWithUsers(
        person({ isAdmin: true, canRenewProofOfLife: true, wallets: ["aa".repeat(28)] }, "1"),
        person({ multiSigPowerMode: "some", multiSigPower: "1" }, "2")
      )
    );

    expect(
      screen.getByText(new RegExp(`Person · ${"a".repeat(8)}`))
    ).toBeInTheDocument();
    expect(screen.getByText("Person #2")).toBeInTheDocument();
    // Each card holds the same four chips; the first person is the owner, the
    // second the co-signer.
    const chipsFor = (name: string) => screen.getAllByRole("button", { name });
    expect(chipsFor("Owner")[0]).toHaveAttribute("aria-pressed", "true");
    expect(chipsFor("Owner")[1]).toHaveAttribute("aria-pressed", "false");
    expect(chipsFor("Check-in")[0]).toHaveAttribute("aria-pressed", "true");
    expect(chipsFor("Co-signer")[0]).toHaveAttribute("aria-pressed", "false");
    expect(chipsFor("Co-signer")[1]).toHaveAttribute("aria-pressed", "true");
    expect(chipsFor("Spender")[0]).toHaveAttribute("aria-pressed", "false");
    // The old counter chips ("Owners 1 OWNER / Spenders 1 SPENDER / Wallets 2/2
    // LINKED") read like a summary but were tabs over the same list.
    expect(screen.queryByText("1 OWNER")).not.toBeInTheDocument();
  });

  it("shows a person count in the header and No issues when the form is clean", () => {
    renderPeople(formWithUsers(person({}, "1"), person({}, "2")));

    expect(screen.getByText("2 persons")).toBeInTheDocument();
    expect(screen.getByText("No issues")).toBeInTheDocument();
  });

  it("offers Add person and explains what the chips do", () => {
    renderPeople();

    expect(screen.getByText(/Everyone in this wallet and what each one may do/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add person/i })).toBeInTheDocument();
  });

  it("shows the required voting power on top, where the chips that derive it are", () => {
    // The rule used to live only on Wallet settings; the reader tuning the powers
    // on this page never saw the number they sum towards.
    const value = formWithUsers(
      person({ multiSigPowerMode: "some", multiSigPower: "2" }, "1")
    );
    value.multiSigThresholdMode = "some";
    value.multiSigThreshold = "2";
    renderPeople(value);

    expect(screen.getByLabelText("Approval power needed")).toHaveAttribute("aria-valuenow", "2");
    // Compact: the people are listed once, as the roster below — not again inside
    // the rule panel.
    expect(screen.queryByText("Co-signers")).not.toBeInTheDocument();
  });

  it("keeps the rule editable from the top and feeds the same form", () => {
    const onChange = vi.fn();
    const value = formWithUsers(
      person({ multiSigPowerMode: "some", multiSigPower: "2" }, "1")
    );
    value.multiSigThresholdMode = "some";
    value.multiSigThreshold = "2";
    renderPeople(value, onChange);

    fireEvent.keyDown(screen.getByLabelText("Approval power needed"), { key: "ArrowLeft" });

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.multiSigThreshold).toBe("1");
    expect(next.users[0].multiSigPower).toBe("2");
  });
});

describe("granting permissions with chips", () => {
  it("grants co-signer with one power, because a blank power would count for nothing", () => {
    const onChange = vi.fn();
    renderPeople(formWithUsers(person({}, "1")), onChange);

    fireEvent.click(chip("Co-signer"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users[0].multiSigPowerMode).toBe("some");
    expect(next.users[0].multiSigPower).toBe("1");
  });

  /**
   * The approval rule is the chips, not a separate switch: granting the first
   * Co-signer chip turns it on with the threshold set to the power the chips hold
   * between them, so "add a co-signer" can never leave a rule nobody can meet.
   */
  it("turns the approval rule on when the first co-signer chip is granted", () => {
    const onChange = vi.fn();
    renderPeople(formWithUsers(person({}, "1")), onChange);

    fireEvent.click(chip("Co-signer"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.multiSigThresholdMode).toBe("some");
    expect(next.multiSigThreshold).toBe("1");
  });

  it("takes the co-signer permission back without touching anything else", () => {
    const onChange = vi.fn();
    const value = formWithUsers(
      person({ multiSigPowerMode: "some", multiSigPower: "2", isAdmin: false }, "1")
    );
    value.multiSigThresholdMode = "some";
    renderPeople(value, onChange);

    fireEvent.click(chip("Co-signer"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users[0].multiSigPowerMode).toBe("none");
    expect(next.users[0].isAdmin).toBe(false);
  });

  it("turns the approval rule back off when the last co-signer chip is revoked", () => {
    const onChange = vi.fn();
    const value = formWithUsers(
      person({ multiSigPowerMode: "some", multiSigPower: "2", isAdmin: false }, "1")
    );
    value.multiSigThresholdMode = "some";
    renderPeople(value, onChange);

    fireEvent.click(chip("Co-signer"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.multiSigThresholdMode).toBe("none");
  });

  it("turns the approval rule off when the only co-signer is removed from the wallet", () => {
    const onChange = vi.fn();
    const value = formWithUsers(
      person({ isAdmin: true }, "1"),
      person({ multiSigPowerMode: "some", multiSigPower: "2" }, "2")
    );
    value.multiSigThresholdMode = "some";
    renderPeople(value, onChange);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users).toHaveLength(1);
    expect(next.multiSigThresholdMode).toBe("none");
  });

  it("grants the spender permission with a limit row to fill in", () => {
    const onChange = vi.fn();
    renderPeople(formWithUsers(person({}, "1")), onChange);

    fireEvent.click(chip("Spender"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users[0].perDayAllowance).toHaveLength(1);
  });

  it("takes the spender permission, and its limits with it", () => {
    const onChange = vi.fn();
    renderPeople(
      formWithUsers(
        person({ perDayAllowance: [{ policyId: "", assetName: "", amount: "5" }] }, "1")
      ),
      onChange
    );

    fireEvent.click(chip("Spender"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users[0].perDayAllowance).toHaveLength(0);
  });

  it("grants the owner permission without wiping the power the person already has", () => {
    // The old admin preset reset co-signer power and limits to nothing. A toggle
    // that quietly erases the person's other permissions is a trap.
    const onChange = vi.fn();
    renderPeople(
      formWithUsers(
        person({ multiSigPowerMode: "some", multiSigPower: "2", wallets: ["bb".repeat(28)] }, "1")
      ),
      onChange
    );

    fireEvent.click(chip("Owner"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users[0].isAdmin).toBe(true);
    expect(next.users[0].canRenewProofOfLife).toBe(true);
    expect(next.users[0].multiSigPowerMode).toBe("some");
    expect(next.users[0].multiSigPower).toBe("2");
    expect(next.users[0].wallets).toEqual(["bb".repeat(28)]);
  });

  it("keeps a check-in right the person holds when the owner chip is taken away", () => {
    const onChange = vi.fn();
    renderPeople(formWithUsers(person({ isAdmin: true, canRenewProofOfLife: true }, "1")), onChange);

    fireEvent.click(chip("Owner"));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users[0].isAdmin).toBe(false);
    expect(next.users[0].canRenewProofOfLife).toBe(true);
  });
});

describe("permissions an owner always holds", () => {
  it("locks the check-in chip on for an owner and says why", () => {
    renderPeople(formWithUsers(person({ isAdmin: true, canRenewProofOfLife: true }, "1")));

    const checkIn = chip("Check-in");
    expect(checkIn).toBeDisabled();
    expect(checkIn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Every owner can always check in.")).toBeInTheDocument();
  });

  it("disables the spender chip for an owner, who has no daily limit", () => {
    renderPeople(formWithUsers(person({ isAdmin: true }, "1")));

    expect(chip("Spender")).toBeDisabled();
  });
});

describe("editing what a held permission means", () => {
  it("shows the power slider for a co-signer and keeps the number the contract will count", () => {
    const onChange = vi.fn();
    renderPeople(
      formWithUsers(person({ multiSigPowerMode: "some", multiSigPower: "2" }, "1")),
      onChange
    );

    const powerSlider = screen.getByLabelText("Approval power");
    expect(powerSlider).toHaveAttribute("aria-valuenow", "2");
    fireEvent.keyDown(powerSlider, { key: "ArrowLeft" });

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users[0].multiSigPower).toBe("1");
  });

  it("caps a co-signer's power slider at the approvals the rule needs", () => {
    // Power beyond the threshold buys nothing, so the track stops at it.
    const value = formWithUsers(
      person({ multiSigPowerMode: "some", multiSigPower: "2" }, "1")
    );
    value.multiSigThresholdMode = "some";
    value.multiSigThreshold = "2";
    renderPeople(value);

    expect(screen.getByLabelText("Approval power")).toHaveAttribute("aria-valuemax", "2");
  });

  it("shows the daily limit editors for a spender", () => {
    renderPeople(
      formWithUsers(
        person({ perDayAllowance: [{ policyId: "", assetName: "", amount: "5" }] }, "1")
      )
    );

    expect(screen.getByText("Daily limit")).toBeInTheDocument();
    expect(screen.getByText("Left to spend")).toBeInTheDocument();
  });

  it("counts linked wallets on the card", () => {
    renderPeople(formWithUsers(person({ wallets: ["aa".repeat(28), "bb".repeat(28)] }, "1")));

    expect(screen.getByText("2 linked wallets")).toBeInTheDocument();
  });

  it("shows the stored wallet id as the address the address book learned for it", () => {
    // A person entry stores the payment key hash the contract compares; the reader
    // recognises the address. Once the app has seen the pair — a connect or a paste —
    // the field names the address instead of machine-speak.
    const TEST2_HASH = "03c422c5d9b8e4e15bcd660ef7a47aed2234f8118bc6e730c5786aa9";
    const TEST2_ADDRESS =
      "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2";
    const store = createStore();
    store.set(activePaymentKeyHashAtom, "dd".repeat(28));
    store.set(resolvedWalletAddressesAtom, { [TEST2_HASH]: TEST2_ADDRESS });

    render(
      <Provider store={store}>
        <FocusedPeopleEditor
          value={formWithUsers(person({ wallets: [TEST2_HASH] }, "1"))}
          onChange={vi.fn()}
          fieldErrors={{}}
        />
      </Provider>
    );

    const field = screen.getByLabelText("Wallets this person signs with, wallet 1");
    expect(field).toHaveValue(TEST2_ADDRESS);
  });
});

describe("adding people", () => {
  it("adds a person with no permissions yet; the chips decide what they hold", () => {
    const onChange = vi.fn();
    renderPeople(formWithUsers(person({ isAdmin: true }, "1")), onChange);

    fireEvent.click(screen.getByRole("button", { name: /add person/i }));

    const next = onChange.mock.calls[0][0] as StateFormState;
    expect(next.users).toHaveLength(2);
    expect(next.users[1].isAdmin).toBe(false);
    expect(next.users[1].multiSigPowerMode).toBe("none");
  });
});

describe("an empty wallet", () => {
  it("offers the Add person action from the empty state", () => {
    renderPeople(formWithUsers());

    expect(screen.getByText("Nobody is in this wallet yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add person/i })).toBeInTheDocument();
  });
});
