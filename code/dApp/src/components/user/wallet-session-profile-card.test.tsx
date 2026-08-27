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
});
