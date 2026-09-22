import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
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

// The picker has its own tests; here it only has to be on the screen.
vi.mock("@/components/user/workspace/governance-vote-picker", () => ({
  GovernanceVotePicker: ({ error }: { error?: string | null }) => (
    <div data-testid="governance-vote-picker">{error}</div>
  )
}));

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
  operatorOptions = holder.operatorOptions,
  fieldErrors = {} as Record<string, string[]>
} = {}) {
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

describe("where the vote comes from", () => {
  it("leads with the picker and folds the raw JSON away", () => {
    const { container } = renderView();

    const picker = screen.getByTestId("governance-vote-picker");
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(details).toContainElement(screen.getByLabelText("Vote JSON"));
    expect(picker.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the JSON by itself when validation rejected a hand-edited payload", () => {
    holder.voteJson = '{"voter":';
    const { container } = renderView({ fieldErrors: { Vote: ["Vote JSON is not valid JSON."] } });
    holder.voteJson = "{}";

    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByTestId("governance-vote-picker")).toBeEmptyDOMElement();
  });

  it("leaves the JSON open once the reader's fix clears the error", () => {
    holder.voteJson = '{"voter":';
    const { container, rerender } = renderView({ fieldErrors: { Vote: ["Vote JSON is not valid JSON."] } });
    holder.fieldErrors = {};
    rerender(
      <Provider store={createStore()}>
        <WalletVoteConfigView />
      </Provider>
    );
    holder.voteJson = "{}";

    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("sends an empty vote's error to the picker and keeps the JSON folded", () => {
    const { container } = renderView({ fieldErrors: { "Vote JSON": ["Pick a governance action."] } });

    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("governance-vote-picker")).toHaveTextContent("Pick a governance action.");
  });

  it("shows the vote shape in the empty box", () => {
    renderView();

    const placeholder = screen.getByLabelText("Vote JSON").getAttribute("placeholder") ?? "";
    expect(placeholder).toContain('"voter"');
    expect(placeholder).toContain('"govActionId"');
    expect(placeholder).toContain('"votingProcedure"');
  });

  it("leaves Clear working so the box can be emptied by hand", () => {
    renderView();

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
