import { fireEvent, render, screen } from "@testing-library/react";
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
   * scheduled-payment reserve)`. An earlier contact is then removed. The final contact
   * stays in State for other fund pools and funds sent later. "Weight" and
   * "distributable pool" name the field and the contract's own word for the money.
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
        "Takes about 25.0% of what the wallet holds once scheduled payments are covered (1 of 4 across every recovery contact). An earlier recovery contact can take this share once and is then removed. The final recovery contact stays available for other fund pools and funds sent later."
      )
    ).toBeInTheDocument();
  });

  it("explains the scale when it cannot work a percentage out", () => {
    renderContact({ weight: "" }, { totalWeight: 0 });

    expect(
      screen.getByText(
        "A bigger number takes a bigger share. Somebody on 2 takes twice as much as somebody on 1. An earlier recovery contact can take one share and is then removed. The final recovery contact stays available for other fund pools and funds sent later."
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
   * The date is the second of two gates. A contact needs the wallet's proof of life to
   * have run out AND their own `unlock_after` to have passed
   * (`smart-contract/lib/state/types.ak:39-41`). The old helper named only the date.
   */
  it("names the proof of life as well as the date", () => {
    renderContact({ unlockAfterMode: "some" });

    expect(
      screen.getByText(
        "Even after the proof of life runs out, this person can take nothing until this time."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("This person also has to wait for the date below.")).toBeInTheDocument();
  });

  it("says why the date is greyed out", () => {
    renderContact({ unlockAfterMode: "none" });

    expect(
      screen.getByText("This person can act as soon as the proof of life runs out.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Set the field beside this to Yes to hold this person back until a date.")
    ).toBeInTheDocument();
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
      "Add someone who can claim what is here if the proof of life runs out.".length
    ).toBeLessThanOrEqual(LONG_DESCRIPTION_LIMIT);
  });
});


describe("the configured payout address", () => {
  const address = "addr_test1qqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyfzyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qwzdgzn";

  it("uses one address for the payout route and signing key", () => {
    const { onChange } = renderContact();
    const input = screen.getByLabelText("Payout and signing wallet");
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: address } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      payoutAddress: address, wallets: ["11".repeat(28)]
    }));
    expect(screen.queryByText("Wallets this person signs with")).not.toBeInTheDocument();
    expect(screen.getByText(/payment key also signs for this recovery contact/i)).toBeInTheDocument();
  });

  it("blocks a script payout address because it cannot sign", () => {
    renderContact({
      payoutAddress: "addr_test1xqenxvenxvenxvenxvenxvenxvenxvenxvenxvenxvenxv6yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zqq7lpaj"
    });
    expect(screen.getByLabelText("Payout and signing wallet")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/script address cannot sign for recovery/i)).toBeInTheDocument();
  });
});
