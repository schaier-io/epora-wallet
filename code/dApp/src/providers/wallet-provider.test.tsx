import { act, render } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mesh = vi.hoisted(() => ({
  enable: vi.fn()
}));

vi.mock("@meshsdk/core", () => ({
  BrowserWallet: {
    enable: mesh.enable,
    getAvailableWallets: () => Promise.resolve([])
  },
  resolvePaymentKeyHash: () => "payment-key-hash"
}));

const { WalletProvider, useWalletContext } = await import("@/providers/wallet-provider");
const { activeWalletNameAtom, activeAddressAtom } = await import("@/providers/wallet.atoms");

function connectableWallet(address: string) {
  return {
    getUsedAddresses: () => Promise.resolve([address]),
    getUnusedAddresses: () => Promise.resolve([]),
    getChangeAddress: () => Promise.resolve(address),
    getRewardAddresses: () => Promise.resolve([`stake_${address}`]),
    getNetworkId: () => Promise.resolve(0)
  };
}

function renderProvider() {
  const store = createStore();
  const controller: { connect: (name: string) => Promise<void> } = {
    connect: () => Promise.resolve()
  };

  function Harness() {
    controller.connect = useWalletContext().connectWallet;
    return null;
  }

  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <Provider store={store}>
        <WalletProvider>
          <Harness />
        </WalletProvider>
      </Provider>
    </NextIntlClientProvider>
  );

  return {
    store,
    connect: async (name: string) => {
      await act(async () => {
        await controller.connect(name).catch(() => {});
      });
    }
  };
}

describe("WalletProvider connect failures", () => {
  beforeEach(() => {
    mesh.enable.mockReset();
    // Both wallets look installed; whether `enable` resolves is what differs.
    Object.defineProperty(window, "cardano", {
      value: { lace: {}, eternl: {} },
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "cardano");
  });

  it("keeps the connected session when a switch to another wallet fails", async () => {
    // The catch used to clear the session unconditionally, so declining or
    // failing a switch left the user disconnected from the wallet they still
    // had, and any build in progress lost its signer.
    mesh.enable.mockResolvedValueOnce(connectableWallet("addr_test1lace"));
    const app = renderProvider();
    await app.connect("lace");
    expect(app.store.get(activeWalletNameAtom)).toBe("lace");

    mesh.enable.mockRejectedValueOnce(new Error("user declined"));
    await app.connect("eternl");

    expect(app.store.get(activeWalletNameAtom)).toBe("lace");
    expect(app.store.get(activeAddressAtom)).toBe("addr_test1lace");
  });

  it("clears the session when the connected wallet itself fails", async () => {
    mesh.enable.mockResolvedValueOnce(connectableWallet("addr_test1lace"));
    const app = renderProvider();
    await app.connect("lace");

    mesh.enable.mockRejectedValueOnce(new Error("wallet locked"));
    await app.connect("lace");

    expect(app.store.get(activeWalletNameAtom)).toBe(null);
    expect(app.store.get(activeAddressAtom)).toBe(null);
  });
});
