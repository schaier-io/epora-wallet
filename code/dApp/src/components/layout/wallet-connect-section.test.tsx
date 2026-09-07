import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ error: null as string | null, session: null as unknown }));

vi.mock("@/providers/walletconnect-provider", () => ({
  useWalletConnect: () => ({
    status: "connected",
    uri: null,
    session: mocks.session,
    error: mocks.error,
    network: "preprod",
    available: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    setNetwork: vi.fn()
  })
}));

import { MobileWalletSection } from "./wallet-connect-section";

beforeEach(() => {
  mocks.error = null;
  mocks.session = null;
});

it("renders a connected peer whose metadata URL is not a URL", () => {
  // Peer metadata is whatever the phone's wallet app sends; `new URL` on it threw in render.
  mocks.session = { topic: "t", peer: { metadata: { name: "Phone Wallet", url: "not a url" } } };
  render(<MobileWalletSection />);
  expect(screen.getByText("Phone Wallet")).toBeInTheDocument();
});

it("shows the peer's hostname when the URL is valid", () => {
  mocks.session = {
    topic: "t",
    peer: { metadata: { name: "Phone Wallet", url: "https://wallet.example/app" } }
  };
  render(<MobileWalletSection />);
  expect(screen.getByText(/wallet\.example/)).toBeInTheDocument();
});

it("announces a WalletConnect error", () => {
  mocks.error = "Could not disconnect the mobile wallet. Try again.";
  render(<MobileWalletSection />);

  expect(screen.getByRole("alert")).toHaveTextContent(mocks.error);
});
