import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Both overlays paint a WebGL layer purely as decoration.
vi.mock("@/components/react-bits/portal", () => ({ Portal: () => null }));
vi.mock("@/components/user/wallet-membership-card", () => ({
  WalletMembershipCard: () => <div data-testid="membership-card" />
}));

const { MintCelebrationOverlay, WalletCreationFullscreenProgress } = await import(
  "@/components/user/workspace/editors/primitives"
);

const COMPLETION = {
  title: "Confirming Family wallet…",
  description: "Your transaction is on the network. This usually takes a block or two.",
  statusLabel: "Waiting for the network to confirm.",
  progress: 45
};

/**
 * The transaction block sets its value in `font-mono`, which is right for a 64-character
 * hash and wrong for the sentence that stands in before one exists: "waiting for network…"
 * was rendered in the hash's own typeface, so it read as a value to copy rather than a
 * status.
 */
describe("wallet creation progress overlay", () => {
  it("does not set its waiting message in the hash typeface", () => {
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />);

    const waiting = screen.getByText("Waiting for the network…");
    expect(waiting.className).not.toContain("font-mono");
    // The percentage keeps `font-mono` for tabular digits, so this asks about the one node.
    expect(waiting.className).toContain("text-muted-foreground");
  });

  it("shows the real hash in monospace once there is one", () => {
    const hash = "ab".repeat(32);
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={hash} />);

    const value = screen.getByText(hash);
    expect(value.className).toContain("font-mono");
    expect(screen.queryByText("Waiting for the network…")).not.toBeInTheDocument();
  });

  it("announces itself politely while the mint is in flight", () => {
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Waiting for the network to confirm.");
  });

  it("renders nothing when there is no mint to report", () => {
    const { container } = render(
      <WalletCreationFullscreenProgress completion={null} submitHash={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Recovery contacts are optional at creation (`config-mint-view.tsx:169` invites the reader
 * to add them "only when this wallet needs them"), so "Secured on Cardano Preprod by
 * on-chain recovery" was not true of every wallet this overlay celebrates. The same sentence
 * carried an em dash, which is banned in shipped copy.
 */
describe("mint celebration overlay", () => {
  function renderCelebration() {
    return render(
      <MintCelebrationOverlay
        walletName="Family wallet"
        sttPolicyId="policy"
        createdWalletUnit="policy.asset"
        onOpenWallet={vi.fn()}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    );
  }

  it("does not claim a recovery feature the wallet may not have", () => {
    const { container } = renderCelebration();

    expect(container.textContent).not.toContain("on-chain recovery");
    expect(container.textContent).toContain("no new seed phrase");
  });

  it("carries no em dash", () => {
    const { container } = renderCelebration();

    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("still names the wallet and offers both ways out", () => {
    renderCelebration();

    expect(screen.getByRole("heading", { name: "Family wallet is live" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open wallet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create another wallet" })).toBeInTheDocument();
  });
});
