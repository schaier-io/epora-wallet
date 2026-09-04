import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
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

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({ activeFieldErrors: holder.fieldErrors })
}));

vi.mock("@/components/user/workspace/forms/use-vote-form", () => ({
  useVoteForm: () => ({ voteJson: "{}", setVoteJson: vi.fn() })
}));

vi.mock("@/components/user/workspace/forms/use-stt-spend-form", () => ({
  useSttSpendForm: () => ({ walletOperatorPath: "admin", setWalletOperatorPath: vi.fn() })
}));

const { WalletVoteConfigView } = await import(
  "@/components/user/workspace/config-walletvote-view"
);

function renderView({
  operatorOptions = holder.operatorOptions,
  fieldErrors = {} as Record<string, string[]>
} = {}) {
  holder.operatorOptions = operatorOptions;
  holder.fieldErrors = fieldErrors;
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
