import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  rewardAddress: "stake_test17qexample" as string | null,
  voteJson: "{}",
  setVoteJson: vi.fn(),
  operatorOptions: [
    { value: "admin", label: "Owner" },
    { value: "multisig", label: "Co-signers" }
  ] as Array<{ value: string; label: string }>,
  fieldErrors: {} as Record<string, string[]>
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-stt-options.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      walletOperatorOptionsAtom: atom(() => holder.operatorOptions)
    };
  }
);

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      walletRewardAddressAtom: atom(() => holder.rewardAddress)
    };
  }
);

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({ activeFieldErrors: holder.fieldErrors })
}));

vi.mock("@/components/user/workspace/forms/use-vote-form", () => ({
  useVoteForm: () => ({ voteJson: holder.voteJson, setVoteJson: holder.setVoteJson })
}));

vi.mock("@/components/user/workspace/forms/use-stt-spend-form", () => ({
  useSttSpendForm: () => ({ walletOperatorPath: "admin", setWalletOperatorPath: vi.fn() })
}));

const { WalletVoteConfigView } = await import(
  "@/components/user/workspace/config-walletvote-view"
);

function renderView({
  rewardAddress = "stake_test17qexample" as string | null,
  operatorOptions = holder.operatorOptions,
  fieldErrors = {} as Record<string, string[]>
} = {}) {
  holder.rewardAddress = rewardAddress;
  holder.operatorOptions = operatorOptions;
  holder.fieldErrors = fieldErrors;
  holder.setVoteJson = vi.fn();
  return render(
    <Provider store={createStore()}>
      <WalletVoteConfigView />
    </Provider>
  );
}

describe("signing path selection", () => {
  it("leaves approval routing to the review rail", () => {
    renderView();

    expect(screen.queryByText("Who approves this vote")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sign as")).not.toBeInTheDocument();
  });
});

describe("what the box needs", () => {
  it("names the three parts of a vote without naming the SDK", () => {
    renderView();

    expect(
      screen.getByText(/who is voting, which proposal, and how you vote \(Yes,\s+No or Abstain\)/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Mesh/)).not.toBeInTheDocument();
    expect(screen.queryByText(/govActionId/)).not.toBeInTheDocument();
    expect(screen.queryByText(/votingProcedure/)).not.toBeInTheDocument();
    expect(screen.queryByText(/voteKind/)).not.toBeInTheDocument();
  });

  /**
   * `govActionId` appears nowhere else in `src`, and `/user/proposals` holds this wallet's
   * own co-signing requests, not Cardano governance actions. The proposal really does have
   * to come from another tool, and the screen now says so.
   */
  it("says where the vote comes from, because the app cannot look it up", () => {
    renderView();

    expect(screen.getByText(/This app cannot look proposals up/)).toBeInTheDocument();
  });

  it("puts that explanation before the box it describes", () => {
    const { container } = renderView();

    const explanation = screen.getByText(/This app cannot look proposals up/);
    const textarea = container.querySelector("#userVoteJson")!;
    expect(
      explanation.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows the vote shape in the empty box", () => {
    renderView();

    const placeholder = screen.getByLabelText("Vote JSON").getAttribute("placeholder") ?? "";
    expect(placeholder).toContain('"voter"');
    expect(placeholder).toContain('"govActionId"');
    expect(placeholder).toContain('"votingProcedure"');
  });
});

/**
 * Mesh's `VoteType` (`@meshsdk/common` `index.d.ts:1607-1626`) is
 * `{voter, govActionId, votingProcedure: {voteKind: "Yes"|"No"|"Abstain"}}`.
 */
describe("vote templates", () => {
  it("writes a Yes vote Mesh can serialize", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(holder.setVoteJson).toHaveBeenCalledTimes(1);
    const written: unknown = JSON.parse(holder.setVoteJson.mock.calls[0][0] as string);
    expect(written).toEqual({
      voter: { type: "DRep", drepId: "" },
      govActionId: { txHash: "", txIndex: 0 },
      votingProcedure: { voteKind: "Yes" }
    });
  });

  it("writes a No vote Mesh can serialize", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "No" }));

    expect(holder.setVoteJson).toHaveBeenCalledTimes(1);
    const written: unknown = JSON.parse(holder.setVoteJson.mock.calls[0][0] as string);
    expect(written).toEqual({
      voter: { type: "DRep", drepId: "" },
      govActionId: { txHash: "", txIndex: 0 },
      votingProcedure: { voteKind: "No" }
    });
  });

  it("writes an Abstain vote Mesh can serialize", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Abstain" }));

    expect(holder.setVoteJson).toHaveBeenCalledTimes(1);
    const written: unknown = JSON.parse(holder.setVoteJson.mock.calls[0][0] as string);
    expect(written).toEqual({
      voter: { type: "DRep", drepId: "" },
      govActionId: { txHash: "", txIndex: 0 },
      votingProcedure: { voteKind: "Abstain" }
    });
  });

  it("turns the templates off when the staking address is unknown", () => {
    renderView({ rewardAddress: null });

    expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abstain" })).toBeDisabled();
    expect(
      screen.getByText(/The templates need this wallet's staking address/)
    ).toBeInTheDocument();
  });

  it("leaves Clear working so the box can be emptied by hand", () => {
    renderView({ rewardAddress: null });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(holder.setVoteJson).toHaveBeenCalledWith("{}");
  });
});

/**
 * The message was rendered beside the box and attached to nothing, and nothing marked the box
 * invalid, so `Textarea`'s own `aria-[invalid=true]` border never fired either. A reader sent
 * back to fix the vote found a field that looked and sounded exactly like one that had passed.
 */
describe("a rejected vote", () => {
  const MESSAGE = "Vote JSON is not valid JSON.";

  it("marks the box it belongs to and reads its reason out with it", () => {
    renderView({ fieldErrors: { "Vote JSON": [MESSAGE] } });

    const box = screen.getByLabelText("Vote JSON");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(MESSAGE);
  });

  it("falls back to the wider Vote key the validator also writes", () => {
    renderView({ fieldErrors: { Vote: [MESSAGE] } });

    const box = screen.getByLabelText("Vote JSON");
    // Both halves, or the box can be described by a message while claiming to be valid.
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(MESSAGE);
  });

  /**
   * An empty box trips both keys at once: the required-text check writes "Vote JSON",
   * and the same value fails `JSON.parse`, which writes "Vote". The narrower message
   * names the box the reader is standing in, so it has to win.
   */
  it("prefers the message written about the box itself", () => {
    renderView({ fieldErrors: { "Vote JSON": [MESSAGE], Vote: ["Something went wrong."] } });

    expect(screen.getByLabelText("Vote JSON")).toHaveAccessibleDescription(MESSAGE);
  });

  it("says nothing about a box that was not rejected", () => {
    renderView();

    const box = screen.getByLabelText("Vote JSON");
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
  });
});
