import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeneficiaryEditor } from "./people-editors";
import { LONG_DESCRIPTION_LIMIT } from "@/components/user/workspace/constants";
import {
  type BeneficiaryFormState,
  createDefaultBeneficiaryFormState
} from "@/lib/contracts/state-form";

function renderContact(
  overrides: Partial<BeneficiaryFormState> = {},
  { totalWeight = 1 } = {}
) {
  const beneficiary = { ...createDefaultBeneficiaryFormState("1"), ...overrides };
  const onChange = vi.fn();
  return {
    onChange,
    ...render(
      <BeneficiaryEditor
        beneficiary={beneficiary}
        index={0}
        totalWeight={totalWeight}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
  };
}

describe("the share", () => {
  /**
   * `Beneficiary.weight` (`smart-contract/lib/state/types.ak:42-48`) is a share against the
   * other contacts, capped at `weight / (sum of weights still present) × (wallet value −
   * scheduled-payment reserve)`, after which the contact is removed. "Weight" and
   * "distributable pool" named the field and the contract's own word for the money.
   */
  it("is labelled by what it does, not by the stored field", () => {
    renderContact({ weight: "1" });

    expect(screen.getByLabelText("Share")).toBeInTheDocument();
    expect(screen.queryByLabelText("Weight")).not.toBeInTheDocument();
    expect(screen.queryByText(/distributable pool/)).not.toBeInTheDocument();
    expect(screen.queryByText(/one-shot/)).not.toBeInTheDocument();
  });

  it("works the percentage out and says what is taken out first", () => {
    renderContact({ weight: "1" }, { totalWeight: 4 });

    expect(
      screen.getByText(
        "Takes about 25.0% of what the wallet holds once scheduled payments are covered (1 of 4 across every recovery contact). They can take it once, and are then removed."
      )
    ).toBeInTheDocument();
  });

  it("explains the scale when it cannot work a percentage out", () => {
    renderContact({ weight: "" }, { totalWeight: 0 });

    expect(
      screen.getByText(
        "A bigger number takes a bigger share. Somebody on 2 takes twice as much as somebody on 1. They can take their share once, and are then removed."
      )
    ).toBeInTheDocument();
  });
});

describe("the extra wait", () => {
  it("drops the Option jargon for a plain question", () => {
    renderContact();

    expect(screen.getByLabelText("Make this person wait longer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unlock After Mode")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Some" })).not.toBeInTheDocument();
  });

  /**
   * The date is the second of two gates. A contact needs the wallet's wake-up timer to
   * have run out AND their own `unlock_after` to have passed
   * (`smart-contract/lib/state/types.ak:39-41`). The old helper named only the date.
   */
  it("names the wake-up timer as well as the date", () => {
    renderContact({ unlockAfterMode: "some" });

    expect(
      screen.getByText(
        "Even after the wake-up timer runs out, this person can take nothing until this time."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("This person also has to wait for the date below.")).toBeInTheDocument();
  });

  it("says why the date is greyed out", () => {
    renderContact({ unlockAfterMode: "none" });

    expect(
      screen.getByText("This person can act as soon as the wake-up timer runs out.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Set the field beside this to Yes to hold this person back until a date.")
    ).toBeInTheDocument();
  });
});

describe("the wallets", () => {
  it("says what the list is for and what an empty one costs", () => {
    renderContact();

    expect(screen.getByText("Wallets this person signs with")).toBeInTheDocument();
    expect(
      screen.getByText("This person can only claim their share from a Cardano wallet listed here.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("No wallet added yet, so this person could not claim anything.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Recovery contact wallets")).not.toBeInTheDocument();
  });
});

describe("the empty-state copy stays visible", () => {
  /**
   * `TaskEmptyState` folds a description longer than `LONG_DESCRIPTION_LIMIT` into an
   * InfoHint, and InfoHints are blocked until backlog 19c is fixed. Pin the length so the
   * text keeps rendering on the page.
   */
  it("fits inside the limit that keeps it out of an InfoHint", () => {
    expect(
      "Add someone who can claim what is here if the wake-up timer runs out.".length
    ).toBeLessThanOrEqual(LONG_DESCRIPTION_LIMIT);
  });
});
