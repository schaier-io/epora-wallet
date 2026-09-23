import { render, screen } from "@testing-library/react";
import type * as DeploymentModule from "@/lib/network-deployments";
import messages from "@/i18n/messages/en";
import { describe, expect, it, vi } from "vitest";

// Both networks live, so a network switch anywhere in the header would render.
vi.mock("@/lib/network-deployments", async (importOriginal) => ({
  ...await importOriginal<typeof DeploymentModule>(),
  NETWORK_DEPLOYMENTS: { mainnet: "https://mainnet.example", preprod: "https://preprod.example" }
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/user",
  useSearchParams: () => new URLSearchParams("wallet=unit-1")
}));

vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => ({
    installedWallets: [],
    activeWalletName: null,
    networkId: null,
    isDemoWallet: false,
    isConnecting: false
  })
}));

vi.mock("@/components/layout/wallet-panel", () => ({
  WalletConnectionDialog: () => null
}));
vi.mock("@/components/user/wallet-session-profile-card", () => ({
  WalletSessionProfileCard: () => <div data-testid="wallet-card" />
}));

const { TopNav } = await import("./top-nav");

describe("header brand link", () => {
  /** The logo was the only header control that dropped `?wallet=`, so clicking the brand
   *  left the wallet you were in and the app auto-picked its default. */
  it("carries the active wallet, like the nav links do", () => {
    render(<TopNav />);

    const brand = screen.getAllByRole("link", { name: /home/i });
    expect(brand.length).toBeGreaterThan(0);
    for (const link of brand) {
      expect(link).toHaveAttribute("href", "/user?wallet=unit-1");
    }
  });
});


it("renders network status without missing interpolation values", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<TopNav />);
    expect(screen.getByText("Network status:")).toBeInTheDocument();
    expect(screen.getByText("preprod · Disconnected")).toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});

// A switch opens the other network's site, where the wallet connects again, so the choice
// lives in the Connect wallet dialog while no wallet is connected, not in the header.
it("keeps the network switch out of the header", () => {
  render(<TopNav />);
  // The label comes from the catalog, so a copy change cannot make this pass vacuously.
  expect(screen.queryByRole("navigation", { name: messages.NetworkSwitch.label })).toBeNull();
});
