import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ current: "mainnet" }));
vi.mock("@/lib/cardano-network", () => ({
  get CARDANO_NETWORK() {
    return network.current;
  }
}));
import { BetaNotice } from "./beta-notice";

beforeEach(() => {
  network.current = "mainnet";
});

it("keeps the mainnet loss warning visible without a dismiss action", () => {
  render(<BetaNotice />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Mainnet beta. No independent security audit. You could lose all funds. Use only funds you can afford to lose."
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
