import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it } from "vitest";

import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useWalletBalance } from "@/components/user/workspace/use-wallet-balance";
import type { BrowserWallet } from "@meshsdk/core";

function lovelace(quantity: string) {
  return [
    {
      output: { amount: [{ unit: "lovelace", quantity }] }
    }
  ];
}

/** A wallet whose `getUtxos` only settles when the test says so. */
function deferredWallet(quantity: string) {
  let release: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    release = resolve;
  });
  const wallet = {
    getUtxos: async () => {
      await settled;
      return lovelace(quantity);
    }
  } as unknown as BrowserWallet;
  return { wallet, release: () => release() };
}

function immediateWallet(quantity: string) {
  return { getUtxos: async () => lovelace(quantity) } as unknown as BrowserWallet;
}

/**
 * The auto-sync effect guarded its write with a `cancelled` flag. `refreshWalletBalance`
 * guarded nothing, and neither could see the other. A refresh started before a wallet
 * switch still wrote the old wallet's UTxOs when it landed, so the balance on screen
 * belonged to a wallet that was no longer connected.
 */
describe("wallet balance reads", () => {
  function renderWithWallet(wallet: BrowserWallet) {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const view = renderHook(
      ({ activeWallet }: { activeWallet: BrowserWallet }) =>
        useWalletBalance(activeWallet, true),
      { wrapper, initialProps: { activeWallet: wallet } }
    );
    return { store, ...view };
  }

  it("drops a refresh that lands after the wallet has changed", async () => {
    const stale = deferredWallet("111");
    const { store, result, rerender } = renderWithWallet(stale.wallet);

    // A refresh against the first wallet. It cannot settle until the test releases it.
    let refreshing!: Promise<void>;
    await act(async () => {
      refreshing = result.current.refreshWalletBalance();
    });

    rerender({ activeWallet: immediateWallet("222") });
    await waitFor(() =>
      expect(store.get(walletBalanceSummaryAtom).assets[0]?.quantity).toBe("222")
    );

    // The first wallet answers last. Its answer must not win.
    await act(async () => {
      stale.release();
      await refreshing;
    });

    expect(store.get(walletBalanceSummaryAtom).assets[0]?.quantity).toBe("222");
  });

  it("still reports the balance of the wallet that is connected", async () => {
    const { store } = renderWithWallet(immediateWallet("333"));

    await waitFor(() =>
      expect(store.get(walletBalanceSummaryAtom).assets[0]?.quantity).toBe("333")
    );
    expect(store.get(walletBalanceSummaryAtom).loading).toBe(false);
    expect(store.get(walletBalanceSummaryAtom).error).toBeNull();
  });
});
