import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletHeroCard, type WalletHeroCardProps } from "@/components/user/wallet-hero-card";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

// Longer than the compact form, so a test cannot confuse the chip with the expansion.
const FULL_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

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
  it("does not round a sub-ADA balance up to one ADA", () => {
    const { container } = renderCard({ balanceLovelace: "999999" });

    expect(container.textContent).toContain("0.999999");
    expect(container.textContent).not.toContain("1.00₳");
  });

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
   * The full address used to live only in the chip's `title` tooltip: unreachable from a
   * keyboard, a touch screen, or a screen reader. A toggle now renders it inline, the way
   * the Add funds panel shows the receive address.
   */
  it("reveals the full address inline instead of through a tooltip", () => {
    renderCard({ address: FULL_ADDRESS });

    expect(screen.queryByText(FULL_ADDRESS)).toBeNull();

    const toggle = screen.getByRole("button", { name: "Show full address" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    expect(screen.getByText(FULL_ADDRESS)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide full address" }).getAttribute("aria-expanded")).toBe(
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide full address" }));

    expect(screen.queryByText(FULL_ADDRESS)).toBeNull();
  });

  it("keeps the copy control and the expand control separate", () => {
    const onCopyAddress = vi.fn();
    renderCard({ address: FULL_ADDRESS, onCopyAddress });

    fireEvent.click(screen.getByLabelText("Copy wallet address"));

    expect(onCopyAddress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(FULL_ADDRESS)).toBeNull();
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
