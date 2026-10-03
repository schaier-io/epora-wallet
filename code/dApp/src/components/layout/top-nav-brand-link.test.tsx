import { fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
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

const walletError = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => ({
    installedWallets: [],
    activeWalletName: null,
    networkId: null,
    isDemoWallet: false,
    isConnecting: false,
    connectError: walletError.value
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

  it("carries the return wallet through global scheduled income", () => {
    render(<TopNav />);
    const links = screen.getAllByRole("link", { name: "Scheduled income" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/payee?wallet=unit-1");
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

it("shows an identity refresh failure and opens the connector for recovery", () => {
  walletError.value = "Wallet identity could not be read.";
  const store = createStore();
  try {
    render(<Provider store={store}><TopNav /></Provider>);
    expect(screen.getByRole("alert")).toHaveTextContent(walletError.value);
    fireEvent.click(screen.getByRole("button", { name: "Check wallet connection" }));
    expect(store.get(walletConnectionDialogOpenAtom)).toBe(true);
  } finally {
    walletError.value = null;
  }
});
