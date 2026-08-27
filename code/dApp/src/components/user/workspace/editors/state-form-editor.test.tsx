import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StateFormEditor } from "./state-form-editor";
import { createDefaultStateForm } from "@/lib/contracts/state-form";

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
  it("does not promise a separate allowance of owners", () => {
    render(
      <StateFormEditor label="Wallet rules" value={createDefaultStateForm()} onChange={() => {}} />
    );

    expect(screen.getByText(/15 people in total, owners and spenders/)).toBeInTheDocument();
    expect(screen.queryByText(/up to 15 owners/)).not.toBeInTheDocument();
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
