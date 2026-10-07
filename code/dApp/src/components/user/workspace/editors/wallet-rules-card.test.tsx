import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { WalletRulesCard, type WalletRule } from "./wallet-rules-card";
import {
  type StateFormState,
  createDefaultBeneficiaryFormState,
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";

const KEY_A = "a1".repeat(28);
const KEY_B = "b2".repeat(28);

function formWith({
  threshold = "2",
  powers = ["2", "1"]
}: { threshold?: string; powers?: string[] } = {}): StateFormState {
  const value = createDefaultStateForm();
  value.users = powers.map((power, index) => ({
    ...createDefaultUserFormState(String(index)),
    multiSigPowerMode: "some" as const,
    multiSigPower: power,
    wallets: [[KEY_A, KEY_B][index] ?? KEY_A]
  }));
  value.multiSigThresholdMode = powers.length > 0 ? "some" : "none";
  value.multiSigThreshold = threshold;
  return value;
}

function Harness({
  initial,
  initialRule = "co-signers",
  withConfirm = true
}: {
  initial: StateFormState;
  initialRule?: WalletRule | null;
  withConfirm?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [rule, setRule] = useState<WalletRule | null>(initialRule);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <>
      <WalletRulesCard
        value={value}
        onChange={setValue}
        openRule={rule}
        onOpenRuleChange={setRule}
        thresholdConfirmed={confirmed}
        onThresholdConfirmedChange={withConfirm ? setConfirmed : undefined}
      />
      <output data-testid="threshold">{value.multiSigThreshold}</output>
      <output data-testid="confirmed">{String(confirmed)}</output>
    </>
  );
}

describe("the co-signers rule", () => {
  it("states the threshold against the power the co-signers hold, closed or open", () => {
    render(<Harness initial={formWith()} initialRule={null} />);
    expect(screen.getByText("Approval power needed: 2 of 3")).toBeInTheDocument();
    expect(screen.queryByLabelText("Approval power needed")).not.toBeInTheDocument();
  });

  it("names the co-signer who meets the threshold alone", () => {
    render(<Harness initial={formWith()} />);
    expect(screen.getByText(`${KEY_A.slice(0, 6)} can act alone. Others need a partner.`)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Approval power needed: 2 of 3" })).toBeInTheDocument();
  });

  it("says everyone must approve when the threshold is the whole total", () => {
    render(<Harness initial={formWith({ threshold: "3" })} />);
    expect(screen.getByText("Every co-signer has to approve. Nobody can be away.")).toBeInTheDocument();
  });

  /**
   * The threshold has no top. A number above the power the co-signers hold is legal on
   * chain (owners can still act), so the card allows it and warns instead of refusing.
   */
  it("steps past the reachable total and then asks for a confirmation", () => {
    render(<Harness initial={formWith({ threshold: "3" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(screen.getByTestId("threshold")).toHaveTextContent("4");
    expect(screen.getByText("No group of co-signers can reach 4")).toBeInTheDocument();
    expect(screen.getByText("1 missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand. Keep this threshold." }));
    expect(screen.getByTestId("confirmed")).toHaveTextContent("true");
  });

  it("takes an exact value typed into the box", () => {
    render(<Harness initial={formWith()} />);
    fireEvent.change(screen.getByLabelText("Approval power needed"), { target: { value: "12" } });
    expect(screen.getByTestId("threshold")).toHaveTextContent("12");
  });

  it("does not step below one", () => {
    render(<Harness initial={formWith({ threshold: "1" })} />);
    expect(screen.getByRole("button", { name: "Decrease" })).toBeDisabled();
  });

  it("points at the people list while nobody is a co-signer", () => {
    render(<Harness initial={formWith({ powers: [] })} />);
    expect(screen.getByText("Off · only the owners can act")).toBeInTheDocument();
    expect(
      screen.getByText("Turn on Co-signer for a person below to let several people act together.")
    ).toBeInTheDocument();
  });
});

describe("the proof of life rule", () => {
  it("is off and switchable while nobody is a recovery contact", () => {
    const onChange = vi.fn<(value: StateFormState) => void>();
    render(
      <WalletRulesCard
        value={formWith({ powers: [] })}
        onChange={onChange}
        openRule="proof-of-life"
        onOpenRuleChange={() => undefined}
      />
    );
    expect(screen.getByText("Off · nobody can recover this wallet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Require proof of life" }));
    expect(onChange.mock.calls[0][0].proofOfLifeUnlockTimeMode).toBe("some");
  });

  /** `validateStateDatum` rejects a recovery contact without a timer. */
  it("hides the switch once someone is a recovery contact", () => {
    const value = formWith({ powers: [] });
    value.beneficiaries = [{ ...createDefaultBeneficiaryFormState("0"), wallets: [KEY_B] }];
    value.proofOfLifeUnlockTimeMode = "some";
    value.proofOfLifeUnlockTime = String(Date.UTC(2027, 0, 6));
    value.proofOfLifeIncrementMode = "some";
    value.proofOfLifeIncrement = String(90 * 24 * 60 * 60 * 1000);
    render(
      <WalletRulesCard value={value} onChange={() => undefined} openRule="proof-of-life" onOpenRuleChange={() => undefined} />
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText(/^Recovery contacts can claim after .*2027/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Recovery timeline" })).toBeInTheDocument();
  });
});
