import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";

import { TestProviders } from "@/test/query-client";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

import { PeopleList } from "./people-list";
import {
  type StateFormState,
  type UserFormState,
  createDefaultBeneficiaryFormState,
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";
import { MAX_ACCESS_RECORDS } from "@/lib/contracts/state-validation";

const KEY_A = "a1".repeat(28);
const KEY_B = "b2".repeat(28);
const KEY_C = "c3".repeat(28);

function user(id: string, wallets: string[], patch: Partial<UserFormState> = {}): UserFormState {
  return { ...createDefaultUserFormState(id), wallets, ...patch };
}

function formWith(patch: Partial<StateFormState>): StateFormState {
  return { ...createDefaultStateForm(), users: [], beneficiaries: [], ...patch };
}

let latest: StateFormState;

function Harness({ initial, initialOpen = null }: { initial: StateFormState; initialOpen?: string | null }) {
  const [value, setValue] = useState(initial);
  const [openKey, setOpenKey] = useState<string | null>(initialOpen);
  const change = (next: StateFormState) => {
    latest = next;
    setValue(next);
  };
  return <PeopleList value={value} onChange={change} openKey={openKey} onOpenKeyChange={setOpenKey} />;
}

function renderList(initial: StateFormState, initialOpen: string | null = null) {
  latest = initial;
  const store = createStore();
  store.set(activePaymentKeyHashAtom, null);
  store.set(activeAddressAtom, null);
  return render(
    <TestProviders store={store}>
      <Harness initial={initial} initialOpen={initialOpen} />
    </TestProviders>
  );
}

const chip = (name: string) => screen.getByRole("button", { name, pressed: undefined });
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("one list of people", () => {
  it("shows a user and the recovery contact on the same wallet as one person", () => {
    renderList(
      formWith({
        users: [user("0", [KEY_A], { isAdmin: true, canRenewProofOfLife: true }), user("1", [KEY_B], { multiSigPowerMode: "some", multiSigPower: "1" })],
        beneficiaries: [{ ...createDefaultBeneficiaryFormState("0"), wallets: [KEY_B] }, { ...createDefaultBeneficiaryFormState("1"), wallets: [KEY_C] }]
      })
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Owner · full control")).toBeInTheDocument();
    expect(screen.getByText("Co-signer · Recovery contact")).toBeInTheDocument();
    expect(screen.getByText("Recovery contact")).toBeInTheDocument();
  });

  it("opens one row at a time", () => {
    renderList(formWith({ users: [user("0", [KEY_A]), user("1", [KEY_B])] }));
    const toggles = screen.getAllByRole("button", { name: /^Show details for/ });
    fireEvent.click(toggles[0]);
    expect(screen.getAllByRole("button", { name: /^Hide details for/ })).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: /^Show details for/ })[0]);
    expect(screen.getAllByRole("button", { name: /^Hide details for/ })).toHaveLength(1);
  });
});

describe("context-aware permissions", () => {
  it("hides every other permission once a person is an owner", () => {
    renderList(formWith({ users: [user("0", [KEY_A], { multiSigPowerMode: "some", multiSigPower: "2" })] }), "user-0");
    fireEvent.click(chip("Owner"));
    expect(pressed("Owner")).toBe("true");
    expect(screen.queryByRole("button", { name: "Co-signer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spender" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recovery contact" })).not.toBeInTheDocument();
    // Cleared rather than hidden: a hidden power would still count toward the total.
    expect(latest.users[0].multiSigPowerMode).toBe("none");
  });

  it("offers check-in only while there is a proof of life to keep running", () => {
    renderList(formWith({ users: [user("0", [KEY_A])] }), "user-0");
    expect(screen.queryByRole("button", { name: "Check-in" })).not.toBeInTheDocument();
  });

  it("shows the approval power with the threshold for a co-signer", () => {
    renderList(
      formWith({
        users: [user("0", [KEY_A], { multiSigPowerMode: "some", multiSigPower: "1" }), user("1", [KEY_B], { multiSigPowerMode: "some", multiSigPower: "1" })],
        multiSigThresholdMode: "some",
        multiSigThreshold: "2"
      }),
      "user-0"
    );
    expect(screen.getByText("1 of 2 needed")).toBeInTheDocument();
    expect(screen.getByText(`${KEY_A.slice(0, 6)} needs 1 more from others`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(latest.users[0].multiSigPower).toBe("2");
    expect(screen.getByText(`${KEY_A.slice(0, 6)} can act alone`)).toBeInTheDocument();
  });
});

describe("recovery contacts behind the same row", () => {
  it("adds a contact on the person's wallet and turns the proof of life on", () => {
    renderList(formWith({ users: [user("0", [KEY_A], { multiSigPowerMode: "some", multiSigPower: "1" })], multiSigThresholdMode: "some", multiSigThreshold: "1" }), "user-0");
    fireEvent.click(chip("Recovery contact"));
    expect(latest.beneficiaries).toHaveLength(1);
    expect(latest.beneficiaries[0].wallets).toEqual([KEY_A]);
    expect(latest.proofOfLifeUnlockTimeMode).toBe("some");
    expect(pressed("Recovery contact")).toBe("true");
    // The payout address is the one thing the user record cannot supply.
    expect(screen.getByLabelText("Payout and signing wallet")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Check-in" })).toBeInTheDocument();
  });

  it("keeps the person whole while a payout address is half typed", () => {
    renderList(formWith({ users: [user("0", [KEY_A], { canRenewProofOfLife: true })] }), "user-0");
    fireEvent.click(chip("Recovery contact"));
    fireEvent.change(screen.getByLabelText("Payout and signing wallet"), { target: { value: "addr_test1qz" } });
    expect(latest.beneficiaries[0].wallets).toEqual([KEY_A]);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("gives a contact a user record when they get a user permission", () => {
    renderList(formWith({ beneficiaries: [{ ...createDefaultBeneficiaryFormState("0"), wallets: [KEY_C] }] }), "contact-0");
    expect(chip("Recovery contact")).toBeDisabled();
    fireEvent.click(chip("Co-signer"));
    expect(latest.users).toHaveLength(1);
    expect(latest.users[0].wallets).toEqual([KEY_C]);
    expect(latest.multiSigThresholdMode).toBe("some");
    // Still one row, still open.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(pressed("Co-signer")).toBe("true");
  });

  it("stops adding recovery contacts at the shared record cap", () => {
    const users = Array.from({ length: MAX_ACCESS_RECORDS }, (_, index) =>
      user(String(index), [index.toString(16).padStart(56, "0")], { canRenewProofOfLife: true })
    );
    renderList(formWith({ users: users.slice(0, 10), beneficiaries: users.slice(10).map((entry) => ({ ...createDefaultBeneficiaryFormState(entry.id), wallets: entry.wallets })) }), "user-0");
    expect(chip("Recovery contact")).toBeDisabled();
    expect(screen.getByText(`This wallet already holds ${MAX_ACCESS_RECORDS} people and recovery contacts. Remove someone to free a slot.`)).toBeInTheDocument();
  });
});

describe("adding and removing", () => {
  it("adds a person and opens their row", () => {
    renderList(formWith({ users: [user("0", [KEY_A], { isAdmin: true })] }));
    fireEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(latest.users).toHaveLength(2);
    expect(screen.getByText("No permissions yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Hide details for/ })).toHaveLength(1);
  });

  it("removes both records behind a row after a confirmation", () => {
    renderList(
      formWith({
        users: [user("0", [KEY_A], { canRenewProofOfLife: true })],
        beneficiaries: [{ ...createDefaultBeneficiaryFormState("0"), wallets: [KEY_A] }]
      }),
      "user-0"
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(latest.users).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
    expect(latest.users).toHaveLength(0);
    expect(latest.beneficiaries).toHaveLength(0);
  });
});
