import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { SessionTypes } from "@walletconnect/types";

const walletConnect = vi.hoisted(() => ({
  state: {} as Record<string, unknown>
}));

vi.mock("@/providers/walletconnect-provider", () => ({
  useWalletConnect: () => walletConnect.state
}));

const { MobileWalletSection } = await import("@/components/layout/wallet-connect-section");

function renderPaired(peerUrl: string) {
  walletConnect.state = {
    status: "connected",
    uri: null,
    error: null,
    network: "preprod",
    available: true,
    session: {
      topic: "paired",
      peer: { metadata: { name: "Some Wallet", url: peerUrl } }
    } as unknown as SessionTypes.Struct,
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    setNetwork: () => {}
  };

  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <MobileWalletSection />
    </NextIntlClientProvider>
  );
}

describe("paired wallet metadata", () => {
  it("shows the host of a real url", () => {
    renderPaired("https://wallet.example.com/app");

    expect(screen.getByText(/wallet\.example\.com/)).toBeInTheDocument();
  });

  it("survives a url the peer sent that cannot be parsed", () => {
    // The value comes from the paired wallet, and this runs during render, so an
    // unparsable url took the whole panel down the moment a pairing succeeded.
    expect(() => renderPaired("not a url")).not.toThrow();
    expect(screen.getByText("Some Wallet")).toBeInTheDocument();
  });
});
