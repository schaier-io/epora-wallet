import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StateFormEditor } from "./state-form-editor";
import {
  withRecoveryContactAdded,
  withScheduledPaymentAdded,
  withUserAdded
} from "@/components/user/workspace/helpers";
import {
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";
import {
  MAX_ACCESS_RECORDS,
  MAX_STREAMING_PAYMENTS,
  MAX_USERS
} from "@/lib/contracts/state-validation";

describe("StateFormEditor streaming-payment controls", () => {
  it("does not offer schedule creation on the UpdateState path", () => {
    render(
      <StateFormEditor
        label="Update State"
        value={createDefaultStateForm()}
        onChange={() => {}}
        allowNewStreamingPayments={false}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Add scheduled payment" })
    ).not.toBeInTheDocument();
  });

  it("stops adding schedules at the on-chain cap", () => {
    let value = createDefaultStateForm();
    for (let index = 0; index < MAX_STREAMING_PAYMENTS; index += 1) {
      value = withScheduledPaymentAdded(value);
    }
    const onChange = vi.fn();
    render(<StateFormEditor label="Wallet rules" value={value} onChange={onChange} />);

    const add = screen.getByRole("button", { name: "Add scheduled payment" });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("one proof of life, one vocabulary", () => {
  function renderTimer() {
    const value = createDefaultStateForm();
    value.proofOfLifeUnlockTimeMode = "some";
    value.proofOfLifeIncrementMode = "some";
    value.proofOfLifeUnlockTime = "1750000000000";
    value.proofOfLifeIncrement = "2592000000";
    return render(<StateFormEditor label="Wallet rules" value={value} onChange={() => {}} />);
  }

  /**
   * VERIFIED, `smart-contract/lib/state/proof_of_life.ak:124`: a renewal must satisfy
   * `updated_unlock_time <= tx_earliest_time + increment`. The new deadline is capped at
   * now plus the increment; it is not the old deadline plus the increment. "Each check-in
   * extends the proof of life by" said it stacks, and checking in early does not.
   */
  it("does not describe a check-in as stacking time on", () => {
    renderTimer();

    expect(screen.getByText("Time each check-in buys")).toBeInTheDocument();
    expect(
      screen.queryByText("Each check-in extends the proof of life by")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Checking in moves the date beside this to that far from now, and no further."
      )
    ).toBeInTheDocument();
  });

  /** E6 named these two fields on the focused tab. One setting, one pair of names. */
  it("uses the same two labels the focused timer tab uses", () => {
    renderTimer();

    expect(screen.getByText("Recovery contacts can claim after")).toBeInTheDocument();
    expect(screen.getByText("Until this time, only the owners can use this wallet.")).toBeInTheDocument();
    expect(screen.queryByText("Recovery can start after")).not.toBeInTheDocument();
  });
});

describe("what the wallet can hold", () => {
  /**
   * VERIFIED, `smart-contract/lib/state/configuration.ak:100`:
   * `expect list.length(users) <= constants.max_users`, applied to the whole `users` list.
   * A `User` carries `is_admin` (`types.ak:78`), so owners and spenders share one cap of
   * 15. The screen said "up to 15 owners", which promised 15 owner slots on top of however
   * many spenders.
   */
  function withOwners(count: number) {
    let value = createDefaultStateForm();
    for (let index = 0; index < count; index += 1) {
      value = withUserAdded(value, "admin");
    }
    return value;
  }

  /** The caps used to be a paragraph above an empty form. Nobody at zero people needs them. */
  it("says nothing about a cap until it is reached", () => {
    render(
      <StateFormEditor label="Wallet rules" value={createDefaultStateForm()} onChange={() => {}} />
    );

    expect(screen.queryByText(/owners and spenders together/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add owner" })).toBeEnabled();
  });

  it("names the shared cap and stops the add buttons once it is reached", () => {
    render(<StateFormEditor label="Wallet rules" value={withOwners(MAX_USERS)} onChange={() => {}} />);

    expect(
      screen.getAllByText(`This wallet already holds ${MAX_USERS} people, owners and spenders together. Remove one to add another.`).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/up to 15 owners/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add owner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add spender" })).toBeDisabled();
  });

  it("stops every access add button at the combined record cap", () => {
    let value = withOwners(MAX_USERS - 1);
    for (let index = value.users.length; index < MAX_ACCESS_RECORDS; index += 1) {
      value = withRecoveryContactAdded(value, index);
    }

    render(<StateFormEditor label="Wallet rules" value={value} onChange={() => {}} />);

    expect(
      screen.getAllByText(
        `This wallet already holds ${MAX_ACCESS_RECORDS} owners, spenders, and recovery contacts in total. Remove one to add another.`
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Add owner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add spender" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add recovery contact" })).toBeDisabled();
  });

  it("stops growing allowances after all users reach the total cap", () => {
    const entries = (count: number) =>
      Array.from({ length: count }, () => ({ policyId: "", assetName: "", amount: "1" }));
    const value = createDefaultStateForm();
    value.users = [
      {
        ...createDefaultUserFormState("0"),
        perDayAllowance: entries(4),
        remainingAllowance: entries(5)
      },
      {
        ...createDefaultUserFormState("1"),
        perDayAllowance: entries(5),
        remainingAllowance: entries(1)
      }
    ];
    render(<StateFormEditor label="Wallet rules" value={value} onChange={vi.fn()} />);

    expect(
      screen
        .getAllByRole("button", { name: "Add daily limit" })
        .every((button) => button.hasAttribute("disabled"))
    ).toBe(true);
  });
});

describe("one place per fact", () => {
  it("does not repeat the counts as tiles above the sections that show them", () => {
    render(
      <StateFormEditor label="Wallet rules" value={createDefaultStateForm()} onChange={() => {}} />
    );

    expect(screen.queryByText("Optional people with daily spending limits.")).not.toBeInTheDocument();
    expect(screen.queryByText("Optional recurring payouts from this wallet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Kept within safe limits")).not.toBeInTheDocument();
  });
});

describe("create flow", () => {
  it("keeps the owners in view and folds the rest behind More settings", () => {
    render(
      <StateFormEditor
        label="Wallet rules"
        value={createDefaultStateForm()}
        onChange={() => {}}
        moreSettingsCollapsed
      />
    );

    expect(screen.getByText("Who can manage this wallet")).toBeInTheDocument();
    expect(screen.queryByText("Recovery contacts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /More settings/ }));
    expect(screen.getByText("Recovery contacts")).toBeInTheDocument();
    expect(screen.getByText("Scheduled payments")).toBeInTheDocument();
  });

  it("opens More settings on its own when the draft already uses one of them", () => {
    const value = withRecoveryContactAdded(createDefaultStateForm(), Date.now());
    render(
      <StateFormEditor label="Wallet rules" value={value} onChange={() => {}} moreSettingsCollapsed />
    );

    expect(screen.getByText("Recovery contacts")).toBeInTheDocument();
  });

  /**
   * Nothing in the create flow sets a person's approval power, so a threshold there could
   * exceed the wallet's total power and lock it. The threshold is offered after minting.
   */
  it("does not offer the co-signer threshold before the wallet exists", () => {
    render(
      <StateFormEditor
        label="Wallet rules"
        value={createDefaultStateForm()}
        onChange={() => {}}
        moreSettingsCollapsed
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /More settings/ }));

    expect(screen.queryByText("Co-signer threshold")).not.toBeInTheDocument();
  });

  it("offers the co-signer threshold on an existing wallet", () => {
    render(<StateFormEditor label="Wallet rules" value={createDefaultStateForm()} onChange={() => {}} />);

    expect(screen.getByText("Co-signer threshold")).toBeInTheDocument();
  });
});

describe("descriptions the reader can actually see", () => {
  /**
   * `WalletRuleSection` and `WalletRuleTogglePanel` fold any description longer than
   * `LONG_DESCRIPTION_LIMIT` (78) into an `InfoHint` instead of rendering it
   * (`wallet-settings-editors.tsx:71` and `:118`). Four of this file's descriptions were
   * over that line, so four explanations were hidden behind a button.
   */
  it("keeps its rule descriptions short enough to render as text", () => {
    render(
      <StateFormEditor label="Wallet rules" value={createDefaultStateForm()} onChange={() => {}} />
    );

    for (const text of [
      "How long you have between check-ins before recovery contacts can act.",
      "Adding one turns on proof of life, so the wallet stays usable.",
      "Owners can change the wallet, send funds, and manage recovery."
    ]) {
      expect(text.length).toBeLessThanOrEqual(78);
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});
