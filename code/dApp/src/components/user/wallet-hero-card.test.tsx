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
 */
function renderCard(overrides: Partial<WalletHeroCardProps> = {}) {
  return render(
    <WalletHeroCard
      walletName="Smart wallet"
      address="addr_test1wr"
      balanceLovelace="8000000"
      onCopyAddress={vi.fn()}
      addressCopied={false}
      onSend={vi.fn()}
      onReceive={vi.fn()}
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

  /**
   * The card used to carry an asset summary under the balance: "Only ADA inside this
   * wallet", "N assets inside this wallet", "No funds in this wallet yet". All three
   * restated the Assets panel that sits directly below it on the dashboard, which lists
   * the assets by name and carries its own empty state. The line is gone, so the card
   * must not grow a replacement.
   */
  it("states the balance once, with no asset summary beside it", () => {
    const { container } = renderCard({ balanceLovelace: "0" });

    expect(container.textContent).not.toMatch(/inside this wallet/i);
    expect(container.textContent).not.toMatch(/No funds in this wallet yet/i);
  });

  /**
   * Activity and Settings used to sit here as outline buttons. They opened the same two
   * panels as the sidebar's own `Activity` and `Wallet settings` entries, which are on
   * screen beside this card. Only the two money moves remain.
   */
  it("offers the two money actions and nothing the sidebar already offers", () => {
    renderCard();

    expect(screen.queryByRole("button", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
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
   * The copy button carried `key={addressCopied ? "copied" : "idle"}` to restart its
   * copy-pulse animation. A key change remounts the node, so React destroyed the focused
   * button and a keyboard user who pressed Enter on Copy landed on `<body>`. Both halves
   * matter: focus stays, and the pulse class still arrives.
   */
  it("keeps keyboard focus on the copy control when the copied state arrives", () => {
    const { rerender } = renderCard({ address: FULL_ADDRESS });

    const copyButton = screen.getByLabelText("Copy wallet address") as HTMLButtonElement;
    copyButton.focus();
    expect(document.activeElement).toBe(copyButton);

    rerender(
      <WalletHeroCard
        walletName="Smart wallet"
        address={FULL_ADDRESS}
        balanceLovelace="8000000"
        onCopyAddress={vi.fn()}
        addressCopied
        onSend={vi.fn()}
        onReceive={vi.fn()}
      />
    );

    const copiedButton = screen.getByLabelText("Wallet address copied");
    expect(copiedButton).toBe(copyButton);
    expect(document.activeElement).toBe(copyButton);
    expect(copiedButton.className).toContain("animate-[copy-pulse");
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
