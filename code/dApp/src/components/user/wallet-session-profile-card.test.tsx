import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletSessionProfileCard } from "@/components/user/wallet-session-profile-card";

/**
 * The card's second line carries the one safety-relevant fact in the header: whether the
 * connected wallet can sign. It was visible text only, so nothing using the accessible name
 * heard it, and a demo session announced itself exactly like a real one.
 *
 * Folding the line into the name exposed a stutter the old label had been hiding: with no
 * wallet connected the caller passes the same words as the name and as the action, so the
 * label read "Connect wallet: Connect wallet".
 */
describe("wallet session profile card", () => {
  it("announces whether the wallet can sign", () => {
    render(
      <WalletSessionProfileCard
        wallet={null}
        walletName="Demo Wallet"
        title="Read-only mode"
        primaryActionLabel="Change wallet"
        onPrimaryAction={vi.fn()}
        forceSimple
        compact
      />
    );

    expect(screen.getByLabelText("Change wallet: Demo Wallet, Read-only mode")).toBeTruthy();
  });

  it("does not say the same words twice when nothing is connected", () => {
    render(
      <WalletSessionProfileCard
        wallet={null}
        walletName="Connect wallet"
        title="Not connected"
        primaryActionLabel="Connect wallet"
        onPrimaryAction={vi.fn()}
        forceSimple
        compact
      />
    );

    expect(screen.getByLabelText("Connect wallet, Not connected")).toBeTruthy();
  });

  /**
   * The header used to carry the network state on a pill beside this card, which said the same
   * thing twice: "Disconnected" on the pill against "Not connected" here. The dot moved onto
   * this line, and it has to stay decoration -- the words beside it already carry the fact, so a
   * second announcement would be the duplication in a new place.
   */
  it("shows the status dot without adding it to the accessible name", () => {
    const { container } = render(
      <WalletSessionProfileCard
        wallet={null}
        walletName="Connect wallet"
        title="Not connected"
        statusDotClassName="bg-muted-foreground"
        primaryActionLabel="Connect wallet"
        onPrimaryAction={vi.fn()}
        forceSimple
        compact
      />
    );

    const dot = container.querySelector("span.bg-muted-foreground");

    expect(dot).toBeTruthy();
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByLabelText("Connect wallet, Not connected")).toBeTruthy();
  });

  it("renders no dot when the caller passes none", () => {
    const { container } = render(
      <WalletSessionProfileCard
        wallet={null}
        walletName="Connect wallet"
        title="Not connected"
        primaryActionLabel="Connect wallet"
        onPrimaryAction={vi.fn()}
        forceSimple
        compact
      />
    );

    expect(container.querySelector("span.rounded-full")).toBe(null);
  });
});
