import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/user",
  useSearchParams: () => new URLSearchParams()
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

// This test is about the hamburger and the panel under it; the two surfaces
// beside it are separate components with their own tests.
vi.mock("@/components/layout/wallet-panel", () => ({
  WalletConnectionDialog: () => null
}));
vi.mock("@/components/user/wallet-session-profile-card", () => ({
  WalletSessionProfileCard: () => <div data-testid="wallet-card" />
}));

const { TopNav } = await import("./top-nav");

describe("mobile navigation", () => {
  /** Escape used to close the panel and drop focus on `<body>`. */
  it("closes on Escape and returns focus to the menu button", () => {
    render(<TopNav />);
    const menu = screen.getByRole("button", { name: "Menu" });

    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");

    // The handler listens on `window`, so focus anywhere in the page reaches
    // it. Escape must bring focus back to the control that opened the panel.
    (screen.getAllByRole("link")[0] as HTMLAnchorElement).focus();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });
});
