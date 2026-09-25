import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ current: "mainnet" }));
vi.mock("@/lib/cardano-network", () => ({
  get CARDANO_NETWORK() {
    return network.current;
  }
}));
import { BetaNotice } from "./beta-notice";

const heightVar = () => document.documentElement.style.getPropertyValue("--beta-notice-h");

beforeEach(() => {
  network.current = "mainnet";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The setup file's ResizeObserver is a no-op. This one reports once on observe, so the
// notice publishes its height the way a browser's first observation would.
function stubMeasuringObserver(height: number) {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(height);
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: () => void) {}
    observe() { this.callback(); }
    disconnect() {}
  });
}

it("keeps the mainnet loss warning visible without a dismiss action", () => {
  render(<BetaNotice />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Mainnet beta. No independent security audit. You could lose all funds. Use only funds you are willing to lose."
  );
  expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  expect(screen.queryByRole("button")).toBeNull();
});

it("links the terms from the dismissible test-network notice", () => {
  network.current = "preprod";
  render(<BetaNotice />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Beta on Cardano preprod. No independent security audit. Do not use real funds."
  );
  expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
});

it("sticks below the TopNav, or at the viewport top when standalone", () => {
  const { rerender } = render(<BetaNotice />);
  expect(screen.getByRole("status")).toHaveClass("sticky", "top-[calc(4rem+1px)]");
  rerender(<BetaNotice standalone />);
  expect(screen.getByRole("status")).toHaveClass("sticky", "top-0");
});

it("publishes its height for other sticky offsets and clears it on unmount", () => {
  stubMeasuringObserver(49);
  const { unmount } = render(<BetaNotice />);
  expect(heightVar()).toBe("49px");
  unmount();
  expect(heightVar()).toBe("");
});

it("clears the published height when a test-network notice is dismissed", () => {
  network.current = "preprod";
  stubMeasuringObserver(49);
  render(<BetaNotice />);
  expect(heightVar()).toBe("49px");
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(heightVar()).toBe("");
});
