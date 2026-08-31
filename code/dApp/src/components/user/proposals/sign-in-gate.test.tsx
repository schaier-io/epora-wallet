import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInGate } from "./sign-in-gate";
import type { ProposalSessionController } from "./use-proposal-session";

const wallet = vi.hoisted(() => ({
  activeAddress: null as string | null,
  isDemoWallet: false
}));

vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => wallet
}));

function controller(
  overrides: Partial<ProposalSessionController> = {}
): ProposalSessionController {
  return {
    session: null,
    loading: false,
    signingIn: false,
    error: null,
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...overrides
  };
}

const signInButton = () => screen.getByRole("button", { name: /sign in with wallet/i });

beforeEach(() => {
  wallet.activeAddress = null;
  wallet.isDemoWallet = false;
});

describe("proposals sign-in gate", () => {
  /**
   * The button is disabled in exactly two situations, and a disabled button is not
   * focusable, so the reason has to be on the page beside it rather than on the control.
   */
  it("names the control to use when no wallet is connected", () => {
    render(<SignInGate session={controller()} />);

    expect(
      screen.getByText(/Use the Connect button at the top of this page/)
    ).toBeInTheDocument();
    expect(signInButton()).toBeDisabled();
  });

  it("says the demo wallet cannot sign", () => {
    wallet.activeAddress = "addr_test1demo";
    wallet.isDemoWallet = true;
    render(<SignInGate session={controller()} />);

    expect(screen.getByText(/demo wallet can look, but it cannot sign/)).toBeInTheDocument();
    expect(signInButton()).toBeDisabled();
  });

  /** One slot, one chrome: whichever reason applies renders in the same bordered callout. */
  it("renders both reasons in the same callout", () => {
    const { container, rerender } = render(<SignInGate session={controller()} />);
    const disconnected = container.querySelector("div.rounded-lg.border")?.className;

    wallet.activeAddress = "addr_test1demo";
    wallet.isDemoWallet = true;
    rerender(<SignInGate session={controller()} />);

    expect(container.querySelector("div.rounded-lg.border")?.className).toBe(disconnected);
  });

  it("drops the callout and enables the button for a signing wallet", () => {
    wallet.activeAddress = "addr_test1real";
    const { container } = render(<SignInGate session={controller()} />);

    expect(container.querySelector("div.rounded-lg.border")).toBeNull();
    expect(signInButton()).not.toBeDisabled();
  });

  /**
   * The failure arrives long after the click, with the wallet popup gone and the page
   * otherwise unchanged, so it has to announce itself.
   */
  it("announces a sign-in failure", () => {
    wallet.activeAddress = "addr_test1real";
    render(<SignInGate session={controller({ error: "Sign-in failed." })} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in failed.");
  });

  it("marks the button busy while the wallet popup is open", () => {
    wallet.activeAddress = "addr_test1real";
    render(<SignInGate session={controller({ signingIn: true })} />);

    const button = screen.getByRole("button", { name: /waiting for wallet/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
