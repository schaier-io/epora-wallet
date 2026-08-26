import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  operatorOptions: [
    { value: "admin", label: "Owner" },
    { value: "multisig", label: "Co-signers" }
  ] as Array<{ value: string; label: string }>
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
  useWorkspaceActions: () => ({ activeFieldErrors: {} })
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

function renderView({ operatorOptions = holder.operatorOptions } = {}) {
  holder.operatorOptions = operatorOptions;
  return render(
    <Provider store={createStore()}>
      <WalletVoteConfigView />
    </Provider>
  );
}

describe("section heading", () => {
  it("names the same control the way the other governance screens do", () => {
    renderView();

    expect(screen.getByText("Who approves this vote")).toBeInTheDocument();
    expect(screen.queryByText("Governance vote path")).not.toBeInTheDocument();
  });

  it("drops the contract's vocabulary for the reader's", () => {
    renderView();

    expect(screen.queryByText(/STT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/operator path/)).not.toBeInTheDocument();
    expect(screen.queryByText(/wrapper flow/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin or Multisig/)).not.toBeInTheDocument();
  });

  /**
   * `OperatorPathSelector` and `ConfigSection` already render this markup class for class
   * (`editors/config-form-primitives.tsx:19-44` and `:122-167`). This file had its own copy
   * of both, with a helper string that had drifted from the shared one.
   */
  it("uses the shared authority picker rather than a local copy", () => {
    renderView();

    expect(
      screen.getByText("Sign as a single owner, or collect the approvals your wallet requires.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Authorization Path")).toBeInTheDocument();
  });

  it("falls back to the shared single-path line when there is only one option", () => {
    renderView({ operatorOptions: [{ value: "admin", label: "Owner" }] });

    expect(screen.getByText(/Authorization path:/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Authorization Path")).not.toBeInTheDocument();
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
