import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const handleFlowBranchSelect = vi.fn();
vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    handleFlowBranchSelect,
    refreshDetectedTokens: vi.fn(),
    refreshPermissionWalletSummaries: vi.fn()
  })
}));

const { WorkspaceLandingView } = await import(
  "@/components/user/workspace/workspace-landing-view"
);

/**
 * This view is hard to see in a browser: it renders only while no smart wallet is open, and
 * the auto-select effect claims that state before it paints for anyone who has one. So the
 * rendered output is checked here instead.
 *
 * Two rules, both with a wrong answer. Each card offers exactly one action, because the
 * bordered panels that used to sit above the buttons restated the cards around them. And
 * nothing here calls a dialog a "popup": the app uses that word for a browser extension's
 * own window ("Check the Lace extension popup and approve the connection"), which is the
 * first popup a reader meets, so a second meaning costs more than the word is worth.
 */
describe("workspace landing", () => {
  it("offers one action per card", () => {
    render(<WorkspaceLandingView />);

    const actions = screen.getAllByRole("button");
    // Neither button repeats its card's title: the left card already says "Create wallet"
    // (and the create wizard's header says it again on the next screen), the right one
    // "Open wallet". The buttons name what the reader reaches instead.
    expect(actions.map((button) => button.textContent?.trim())).toEqual([
      "Start setup",
      "Choose smart wallet"
    ]);
  });

  it("does not call a dialog a popup", () => {
    const { container } = render(<WorkspaceLandingView />);
    expect(container.textContent).not.toMatch(/popup/i);
  });
});
