import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletHeroCard, type WalletHeroCardProps } from "@/components/user/wallet-hero-card";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

/**
 * Two rules, both with a wrong answer that shipped.
 *
 * The card's action row may only use a name its destination already carries, the same rule
 * the shortcuts sheet is held to. "Receive" was not one of them: the screen it opens is
 * `?action=add-funds`, titles the tab "Add funds · Epora Wallet" and heads its form
 * "Add funds details". Nothing there said Receive.
 *
 * And a wallet holding nothing said "Only ADA inside this wallet" under a balance of 0.00.
 * That branch was unreachable from the app, because the dashboard clamped the asset count to
 * a minimum of one to keep the summary off "0 assets". The clamp is gone and the empty case
 * has its own sentence, so this is the test that the empty wallet tells the truth.
 */
function renderCard(overrides: Partial<WalletHeroCardProps> = {}) {
  return render(
    <WalletHeroCard
      walletName="Smart wallet"
      address="addr_test1wr"
      balanceLovelace="8000000"
      assetTypeCount={1}
      fundingSourceCount={1}
      onCopyAddress={vi.fn()}
      addressCopied={false}
      onSend={vi.fn()}
      onReceive={vi.fn()}
      onActivity={vi.fn()}
      onSettings={vi.fn()}
      {...overrides}
    />
  );
}

function namesFor(kind: "use" | "lock-funds"): string[] {
  const definition = USER_ACTION_DEFINITION_MAP[kind];
  return [definition.label, definition.shortLabel, definition.surfaceLabel];
}

describe("wallet hero card", () => {
  it("names the two funds actions after their destinations", () => {
    renderCard();

    expect(namesFor("use")).toContain(screen.getByRole("button", { name: "Send" }).textContent);
    expect(namesFor("lock-funds")).toContain(
      screen.getByRole("button", { name: "Add funds" }).textContent
    );
  });

  it("does not claim an empty wallet holds ADA", () => {
    const { container } = renderCard({ assetTypeCount: 0, balanceLovelace: "0" });

    expect(screen.getByText("No funds in this wallet yet")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Only ADA/);
  });

  it("says what the address control does, not just what it shows", () => {
    renderCard();

    expect(screen.getByLabelText("Copy wallet address")).toBeTruthy();
  });

  /**
   * The card sits inside the "Wallet home" card, whose `CardTitle` is an `h3`. The wallet name
   * was an `h2`, so it outranked the card containing it and heading navigation on the app's main
   * screen ran h1, h3, then backwards to h2. Level 3 keeps the name a sibling of its container
   * rather than its parent.
   */
  it("names the wallet at the level of the card it sits in", () => {
    renderCard({ walletName: "Household" });
    expect(screen.getByRole("heading", { name: "Household", level: 3 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Household", level: 2 })).toBeNull();
  });
});
