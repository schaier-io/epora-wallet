import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { createDefaultStateForm, type StateFormState, type UserFormState } from "@/lib/contracts/state-form";
import type { ProposalBuildContext } from "@/lib/proposals/types";
import { applyCoSigners, CoSignerPicker, describeCoSignerChoice } from "./cosigner-picker";

const PROPOSER = "aa".repeat(28);
const OTHER = "bb".repeat(28);
const THIRD = "cc".repeat(28);

function user(id: string, wallet: string, power: string): UserFormState {
  return {
    id,
    wallets: [wallet],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "",
    canRenewProofOfLife: false,
    multiSigPowerMode: "some",
    multiSigPower: power,
    isAdmin: false,
    preset: "custom"
  };
}

function multisigForm(): StateFormState {
  const form = createDefaultStateForm();
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "3";
  form.users = [user("p", PROPOSER, "2"), user("o", OTHER, "2"), user("t", THIRD, "1")];
  return form;
}

it("offers everyone but the proposer and scores the listed set as the chain will", () => {
  const alone = describeCoSignerChoice(multisigForm(), "multisig", PROPOSER.toUpperCase(), []);
  expect(alone.candidates.map((signer) => signer.keyHash)).toEqual([OTHER, THIRD]);
  expect(alone.listed.satisfiedPower).toBe(2);
  expect(alone.listed.satisfied).toBe(false);

  const withOther = describeCoSignerChoice(multisigForm(), "multisig", PROPOSER, [OTHER]);
  expect(withOther.listed.satisfiedPower).toBe(4);
  expect(withOther.listed.satisfied).toBe(true);
});

it("stores the chosen co-signers in every approval-capable build input", () => {
  const contexts = [
    { builder: "stt-spend", mode: "use", config: {}, input: { marker: "stt" } },
    { builder: "wallet-withdraw", config: {}, input: { marker: "withdraw" } },
    { builder: "wallet-publish", config: {}, input: { marker: "publish" } },
    { builder: "wallet-vote", config: {}, input: { marker: "vote" } },
    {
      builder: "set-intended-stake-credential",
      config: {},
      input: { marker: "stake" }
    },
    { builder: "consolidate-utxo", config: {}, input: { marker: "consolidate" } }
  ] as unknown as ProposalBuildContext[];

  for (const context of contexts) {
    expect(applyCoSigners(context, [OTHER])).toEqual({
      ...context,
      input: { ...context.input, requiredSignerKeyHashes: [OTHER] }
    });
  }

  const other = { builder: "wallet-spend", config: {}, input: {} } as unknown as ProposalBuildContext;
  expect(applyCoSigners(other, [OTHER])).toBe(other);
});

function Harness() {
  const [chosen, setChosen] = useState<string[]>([]);
  const choice = describeCoSignerChoice(multisigForm(), "multisig", PROPOSER, chosen);
  return <CoSignerPicker choice={choice} chosen={chosen} onChange={setChosen} />;
}

it("updates the listed power as co-signers are ticked", () => {
  render(<Harness />);

  expect(screen.getByText("2 of 3 approval power once everyone listed signs.")).toBeInTheDocument();
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(2);

  fireEvent.click(boxes[0]!);
  expect(screen.getByText("4 of 3 approval power once everyone listed signs.")).toBeInTheDocument();

  fireEvent.click(boxes[0]!);
  expect(screen.getByText("2 of 3 approval power once everyone listed signs.")).toBeInTheDocument();
});
