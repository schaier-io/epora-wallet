import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WalletConnectQr } from "./walletconnect-qr";

/**
 * The pairing QR is the whole surface: if it has no accessible name, a screen-reader user is
 * told nothing at all about the one thing on screen. The rendered code always had a name; the
 * placeholder that shows while the URI is still being negotiated was a blank white square with
 * `aria-busy` and nothing else.
 */
describe("WalletConnectQr", () => {
  it("names the rendered code", () => {
    render(<WalletConnectQr uri="wc:topic@2?relay-protocol=irn&symKey=abc" size={248} />);

    expect(screen.getByRole("img", { name: "WalletConnect pairing QR code" })).toBeInTheDocument();
  });

  it("names the placeholder it shows before a URI exists", () => {
    render(<WalletConnectQr uri={null} size={248} />);

    const placeholder = screen.getByRole("img", { name: "Preparing the pairing QR code" });
    expect(placeholder).toHaveAttribute("aria-busy");
  });
});
