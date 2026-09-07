import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInGate } from "./sign-in-gate";
import type { ProposalSessionController } from "./use-proposal-session";

const wallet = vi.hoisted(() => ({
  activeAddress: null as string | null,
  activePaymentKeyHash: null as string | null,
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
    connectedWalletMismatch: false,
    activeAddress: null,
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
  wallet.activePaymentKeyHash = null;
  wallet.isDemoWallet = false;
});

describe("proposals sign-in gate", () => {
  /**
   * The gate returns instead of the workspace, and the workspace owns the route's only `h1`.
   * Signed out, `/user/proposals` therefore had no page heading at all.
   */
  it("carries the page heading while it stands in for the workspace", () => {
    render(<SignInGate session={controller()} />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/sign in to see approval requests/i);
  });

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
   * The session cookie outlives the wallet connection. Switching account inside the
   * extension used to leave the previous account's approval requests on screen, so the
   * gate has to name both keys: the bare "sign in" card reads as "you were signed out"
   * and says nothing about the wallet the user just switched to.
   */
  it("names both keys when the connected wallet is not the signed-in one", () => {
    wallet.activeAddress = "addr_test1real";
    wallet.activePaymentKeyHash = "27c006ce8c4a4f84ccb6cc9a69ba61118966599c72cb6cfdbcd36810";
    render(
      <SignInGate
        session={controller({
          session: {
            paymentKeyHash: "bc3f3eae902eaf53b3d8a1f9d7ad2e6b370f8b9ec8c9b62a9044455b",
            address: "addr_test1old"
          },
          connectedWalletMismatch: true
        })}
      />
    );

    expect(screen.getByText(/bc3f3eae90/)).toBeInTheDocument();
    expect(screen.getByText(/27c006ce8c/)).toBeInTheDocument();
    // The fix is to press the button, so it must stay usable.
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
