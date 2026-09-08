import { onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { afterEach, expect, it, vi } from "vitest";
import type { BrowserWallet } from "@meshsdk/core";
import { activeAddressAtom, activeWalletAtom, activeWalletNameAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { createQueryTestWrapper } from "@/test/query-client";
import { walletBalanceSummaryAtom } from "./atoms/workspace-data.atoms";
import { useWalletBalance } from "./use-wallet-balance";

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
