import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEMO_ID = "__demo__";
const demoWallet = { id: DEMO_ID, name: "Demo wallet", icon: "", version: "0" };
const eternl = { id: "eternl", name: "Eternl", icon: "", version: "1" };

const ctx = vi.hoisted(() => ({
  installedWallets: [] as Array<{ id: string; name: string; icon: string; version: string }>,
  walletsLoaded: false,
  activeWalletName: null as string | null,
  disconnectWallet: vi.fn()
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
    disconnectWallet: ctx.disconnectWallet,
    refreshWallets: vi.fn(async () => {})
  })
}));

const { WalletConnectionDialog } = await import("@/components/layout/wallet-panel");

describe("wallet connection dialog", () => {
  beforeEach(() => {
    ctx.installedWallets = [];
    ctx.walletsLoaded = false;
    ctx.activeWalletName = null;
    ctx.disconnectWallet.mockClear();
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
    // The links read as one sentence, with a space on both sides of "or".
    expect(document.body.textContent).toContain("such as Lace, Eternl, or Vespr.");
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

  /**
   * The connector's Disconnect sits inside the section the switcher hides, so the switcher had
   * none -- and since the nav and the workspace share one dialog and one open flag, the switcher
   * is what the header wallet control opens on `/user` once a wallet is connected.
   */
  it("offers disconnect in the smart-wallet switcher", () => {
    ctx.walletsLoaded = true;
    ctx.installedWallets = [eternl];
    ctx.activeWalletName = "eternl";
    const onOpenChange = vi.fn();

    render(
      <WalletConnectionDialog open onOpenChange={onOpenChange} title="Choose smart wallet">
        <p>Smart wallet list</p>
      </WalletConnectionDialog>
    );

    // The connect list stays hidden: choosing a smart wallet is the point of this shape.
    expect(screen.queryByRole("button", { name: "Refresh list" })).toBeNull();
    // The connected wallet is named, so the row says what is about to be dropped.
    expect(screen.getByText("Eternl")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));

    expect(ctx.disconnectWallet).toHaveBeenCalledTimes(1);
    // Left open, the dialog would retitle itself and swap its body for the connector while
    // focus sat on the button that just unmounted.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers no disconnect in the switcher shape while nothing is connected", () => {
    ctx.walletsLoaded = true;
    ctx.installedWallets = [eternl];

    render(
      <WalletConnectionDialog open onOpenChange={() => {}} title="Choose smart wallet">
        <p>Smart wallet list</p>
      </WalletConnectionDialog>
    );

    expect(screen.queryByRole("button", { name: /Disconnect/ })).toBeNull();
  });

  it("keeps a single disconnect in the plain connector shape", () => {
    ctx.walletsLoaded = true;
    ctx.installedWallets = [eternl];
    ctx.activeWalletName = "eternl";

    // No children means no switcher, so the connector's own Disconnect is the only one.
    render(<WalletConnectionDialog open onOpenChange={() => {}} />);

    expect(screen.getAllByRole("button", { name: /Disconnect/ })).toHaveLength(1);
  });
});
