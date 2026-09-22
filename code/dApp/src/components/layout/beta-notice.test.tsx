import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/cardano-network", () => ({ CARDANO_NETWORK: "mainnet" }));
import { BetaNotice } from "./beta-notice";

it("keeps the mainnet loss warning visible without a dismiss action", () => {
  render(<BetaNotice />);
  expect(screen.getByRole("status")).toHaveTextContent("Mainnet beta. No independent security audit. You could lose all funds.");
  expect(screen.queryByRole("button")).toBeNull();
});
