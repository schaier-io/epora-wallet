import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEMO_ID = "__demo__";
const demoWallet = { id: DEMO_ID, name: "Demo wallet", icon: "", version: "0" };
const eternl = { id: "eternl", name: "Eternl", icon: "", version: "1" };

const ctx = vi.hoisted(() => ({
  installedWallets: [] as Array<{ id: string; name: string; icon: string; version: string }>,
  walletsLoaded: false,
  activeWalletName: null as string | null
}));

vi.mock("@/providers/wallet-provider", () => ({
  DEMO_WALLET_ID: "__demo__",
  useWalletContext: () => ({
    installedWallets: ctx.installedWallets,
    walletsLoaded: ctx.walletsLoaded,
    activeWalletName: ctx.activeWalletName,
    connectingWalletName: null,
    networkId: ctx.activeWalletName ? 0 : null,
    isConnecting: false,
    isDemoWallet: false,
    connectWallet: vi.fn(),
    cancelConnect: vi.fn(),
    disconnectWallet: vi.fn(),
    refreshWallets: vi.fn(async () => {})
  })
}));

const { WalletConnectionDialog } = await import("@/components/layout/wallet-panel");

describe("wallet connection dialog", () => {
  beforeEach(() => {
    ctx.installedWallets = [];
    ctx.walletsLoaded = false;
    ctx.activeWalletName = null;
  });

  it("says nothing about missing extensions before the first scan settles", () => {
    render(<WalletConnectionDialog open onOpenChange={() => {}} />);

    expect(screen.queryByText("No extension detected")).toBeNull();
  });

  it("links the wallets to install and hides the network and refresh controls without one", () => {
    ctx.walletsLoaded = true;
    ctx.installedWallets = [demoWallet];
    render(<WalletConnectionDialog open onOpenChange={() => {}} />);

    expect(screen.getByText("No extension detected")).toBeTruthy();
    for (const [name, host] of [
      ["Lace", "lace.io"],
      ["Eternl", "eternl.io"],
      ["Vespr", "vespr.xyz"]
    ]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("href")).toContain(host);
      expect(link.getAttribute("rel")).toBe("noreferrer");
    }
    expect(screen.queryByText("Network unknown")).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh list" })).toBeNull();
    expect(screen.getByRole("button", { name: /Demo wallet/ })).toBeTruthy();
  });

  it("keeps the smart-wallet step out of sight until a wallet is connected", () => {
    ctx.walletsLoaded = true;
    ctx.installedWallets = [eternl];
    const { rerender } = render(
      <WalletConnectionDialog open onOpenChange={() => {}} title="Choose smart wallet">
        <p>Smart wallet list</p>
      </WalletConnectionDialog>
    );

    expect(screen.queryByText("Smart wallet list")).toBeNull();
    expect(screen.queryByText("2")).toBeNull();
    expect(screen.getByText("Connect wallet")).toBeTruthy();

    ctx.activeWalletName = "eternl";
    rerender(
      <WalletConnectionDialog open onOpenChange={() => {}} title="Choose smart wallet">
        <p>Smart wallet list</p>
      </WalletConnectionDialog>
    );

    expect(screen.getByText("Smart wallet list")).toBeTruthy();
    expect(screen.getByText("Choose smart wallet")).toBeTruthy();
  });
});
