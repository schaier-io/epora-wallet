import { onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { afterEach, expect, it, vi } from "vitest";
import type { BrowserWallet } from "@meshsdk/core";
import { activeAddressAtom, activeWalletAtom, activeWalletNameAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { createQueryTestWrapper } from "@/test/query-client";
import { walletBalanceSummaryAtom } from "./atoms/workspace-data.atoms";
import { useWalletBalance } from "./use-wallet-balance";
import { routeStateAtom } from "./atoms/workspace-route.atoms";

const clients: ReturnType<typeof createQueryTestWrapper>["queryClient"][] = [];
afterEach(() => clients.splice(0).forEach(client => client.clear()));
function utxos(quantity: string) {
  return [{ output: { amount: [{ unit: "lovelace", quantity }] } }] as Awaited<ReturnType<BrowserWallet["getUtxos"]>>;
}
function setup(getUtxos: BrowserWallet["getUtxos"]) {
  const context = createQueryTestWrapper();
  clients.push(context.queryClient);
  const wallet = { getUtxos } as BrowserWallet;
  context.store.set(activeWalletAtom, wallet);
  context.store.set(activeWalletNameAtom, "lace");
  context.store.set(networkIdAtom, 0);
  context.store.set(activeAddressAtom, "account-one");
  const useBalance = () => ({ ...useWalletBalance(), summary: useAtomValue(walletBalanceSummaryAtom) });
  return { ...context, hook: useBalance, wallet };
}
it("reads a new account when the wallet SDK object stays the same", async () => {
  const getUtxos = vi.fn().mockResolvedValueOnce(utxos("111")).mockResolvedValue(utxos("222"));
  const context = setup(getUtxos);
  const view = renderHook(context.hook, { wrapper: context.wrapper });
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));
  act(() => context.store.set(activeAddressAtom, "account-two"));
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("222"));
});
it("shares one read between two balance consumers", async () => {
  const getUtxos = vi.fn().mockResolvedValue(utxos("111"));
  const context = setup(getUtxos);
  const first = renderHook(context.hook, { wrapper: context.wrapper });
  const second = renderHook(context.hook, { wrapper: context.wrapper });
  await waitFor(() => expect(first.result.current.summary.assets[0]?.quantity).toBe("111"));
  expect(second.result.current.summary.assets[0]?.quantity).toBe("111");
  expect(getUtxos).toHaveBeenCalledTimes(1);
});
it("keeps the last good balance when refresh fails", async () => {
  const getUtxos = vi.fn().mockResolvedValueOnce(utxos("111")).mockRejectedValue(new Error("provider offline"));
  const context = setup(getUtxos);
  const view = renderHook(context.hook, { wrapper: context.wrapper });
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));
  await act(() => view.result.current.refreshWalletBalance());
  await waitFor(() => expect(view.result.current.summary.error).toBeTruthy());
  expect(view.result.current.summary.assets[0]?.quantity).toBe("111");
});

it("does not report an empty wallet while the first read is paused offline", async () => {
  onlineManager.setOnline(false);
  try {
    const getUtxos = vi.fn().mockResolvedValue(utxos("111"));
    const context = setup(getUtxos);
    const view = renderHook(context.hook, { wrapper: context.wrapper });
    expect(view.result.current.summary.loading).toBe(true);
    expect(getUtxos).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));
  } finally { onlineManager.setOnline(true); }
});

it("hides the previous connection's funds before its replacement finishes reading", async () => {
  const context = setup(vi.fn().mockResolvedValue(utxos("111")));
  const view = renderHook(context.hook, { wrapper: context.wrapper });
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));
  let finish!: (value: ReturnType<typeof utxos>) => void;
  const getUtxos = vi.fn(() => new Promise<ReturnType<typeof utxos>>(resolve => { finish = resolve; }));

  act(() => context.store.set(activeWalletAtom, { getUtxos } as unknown as BrowserWallet));

  expect(view.result.current.summary).toEqual({ assets: [], loading: true, error: null });
  await waitFor(() => expect(getUtxos).toHaveBeenCalled());
  await act(async () => finish(utxos("222")));
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("222"));
});

it("requires a new balance when returning to an account within the cache freshness window", async () => {
  const getUtxos = vi.fn().mockResolvedValueOnce(utxos("111"))
    .mockResolvedValue(utxos("222"));
  const context = setup(getUtxos);
  const view = renderHook(context.hook, { wrapper: context.wrapper });
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));
  act(() => context.store.set(activeAddressAtom, "account-two"));
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("222"));
  let finish!: (value: ReturnType<typeof utxos>) => void;
  getUtxos.mockImplementation(() => new Promise(resolve => { finish = resolve; }));

  act(() => context.store.set(activeAddressAtom, "account-one"));

  expect(view.result.current.summary).toEqual({ assets: [], loading: true, error: null });
  await waitFor(() => expect(getUtxos.mock.calls.length).toBeGreaterThanOrEqual(3));
  await act(async () => finish(utxos("333")));
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("333"));
});

it("keeps the same account cache across identity rechecks and smart-wallet navigation", async () => {
  const getUtxos = vi.fn().mockResolvedValue(utxos("111"));
  const context = setup(getUtxos);
  const view = renderHook(context.hook, { wrapper: context.wrapper });
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));

  act(() => {
    context.store.set(activeWalletAtom, wallet => wallet);
    context.store.set(activeWalletNameAtom, "lace");
    context.store.set(activeAddressAtom, "account-one");
    context.store.set(networkIdAtom, 0);
    context.store.set(routeStateAtom, { ...context.store.get(routeStateAtom), selectedWalletUnit: "another-smart-wallet" });
  });

  expect(view.result.current.summary).toEqual({ assets: [{ unit: "lovelace", quantity: "111" }], loading: false, error: null });
  expect(getUtxos).toHaveBeenCalledTimes(1);
});
