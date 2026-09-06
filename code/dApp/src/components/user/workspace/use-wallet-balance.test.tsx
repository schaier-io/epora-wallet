import { act, render } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it } from "vitest";
import type { BrowserWallet } from "@meshsdk/core";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useWalletBalance } from "@/components/user/workspace/use-wallet-balance";

type PendingRead = { resolve: () => void };

/**
 * A wallet whose reads finish only when the test says so, in whatever order it
 * chooses. The post-submit poll calls refreshWalletBalance four times over ~75s
 * while the mount read may still be open, so overlapping reads are the normal
 * case here, not a corner one.
 */
function controllableWallet(lovelaceByCall: string[]) {
  const pending: PendingRead[] = [];
  let call = 0;

  const wallet = {
    getUtxos: () => {
      const quantity = lovelaceByCall[call] ?? "0";
      call += 1;
      return new Promise((resolve) => {
        pending.push({
          resolve: () =>
            resolve([
              { output: { amount: [{ unit: "lovelace", quantity }] } }
            ] as Awaited<ReturnType<BrowserWallet["getUtxos"]>>)
        });
      });
    }
  } as unknown as BrowserWallet;

  return { wallet, pending };
}

function renderBalance(wallet: BrowserWallet) {
  const store = createStore();
  const controller: { refresh: () => Promise<void> } = {
    refresh: () => Promise.resolve()
  };

  function Harness() {
    controller.refresh = useWalletBalance(wallet, true).refreshWalletBalance;
    return null;
  }

  render(
    <Provider store={store}>
      <Harness />
    </Provider>
  );

  return {
    store,
    refresh: () => controller.refresh(),
    quantity: () => store.get(walletBalanceSummaryAtom).assets[0]?.quantity
  };
}

describe("useWalletBalance", () => {
  it("ignores a read that answers after a newer one", async () => {
    const { wallet, pending } = controllableWallet(["1000000", "9000000"]);
    const balance = renderBalance(wallet);

    // The mount read is still open when the post-submit refresh starts.
    await act(async () => {
      void balance.refresh();
    });
    expect(pending).toHaveLength(2);

    // The newer read answers first, then the older one. Before the request token
    // the older answer won and the balance went backwards to a figure the wallet
    // had already moved past.
    await act(async () => {
      pending[1].resolve();
      await Promise.resolve();
      pending[0].resolve();
      await Promise.resolve();
    });

    expect(balance.quantity()).toBe("9000000");
  });

  it("publishes a read that nothing supersedes", async () => {
    const { wallet, pending } = controllableWallet(["4000000"]);
    const balance = renderBalance(wallet);

    await act(async () => {
      pending[0].resolve();
      await Promise.resolve();
    });

    expect(balance.quantity()).toBe("4000000");
    expect(balance.store.get(walletBalanceSummaryAtom).loading).toBe(false);
  });
});
