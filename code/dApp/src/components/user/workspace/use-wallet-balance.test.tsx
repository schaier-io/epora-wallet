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
  context.store.set(activeWalletAtom, { getUtxos } as BrowserWallet);
  context.store.set(activeWalletNameAtom, "lace");
  context.store.set(networkIdAtom, 0);
  context.store.set(activeAddressAtom, "first");
  const view = renderHook(() => ({ ...useWalletBalance(), summary: useAtomValue(walletBalanceSummaryAtom) }), { wrapper: context.wrapper });
  return { ...context, ...view };
}
it("retires a pending old-account read", async () => {
  let resolve!: (value: ReturnType<typeof utxos>) => void;
  const getUtxos = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue(utxos("222"));
  const view = setup(getUtxos);
  act(() => view.store.set(activeAddressAtom, "second"));
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("222"));
  await act(async () => resolve(utxos("111")));
  expect(view.result.current.summary.assets[0]?.quantity).toBe("222");
});
it("hides account data immediately on disconnect", async () => {
  const view = setup(vi.fn().mockResolvedValue(utxos("111")));
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));
  act(() => view.store.set(activeWalletAtom, null));
  expect(view.result.current.summary).toEqual({ assets: [], loading: false, error: null });
});
it("retires a pending read when the final observer unmounts", async () => {
  let resolve!: (value: ReturnType<typeof utxos>) => void;
  const view = setup(() => new Promise(done => { resolve = done; }));
  view.unmount();
  await act(async () => resolve(utxos("111")));
  expect(view.queryClient.getQueriesData({ queryKey: ["signer-utxos"] }).every(([, data]) => data === undefined)).toBe(true);
});
it("cancels an older background read when refresh starts", async () => {
  let resolve!: (value: ReturnType<typeof utxos>) => void;
  const getUtxos = vi.fn().mockResolvedValueOnce(utxos("111"))
    .mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue(utxos("333"));
  const view = setup(getUtxos);
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("111"));
  let first!: Promise<void>;
  act(() => { first = view.result.current.refreshWalletBalance(); });
  await act(() => view.result.current.refreshWalletBalance());
  await waitFor(() => expect(view.result.current.summary.assets[0]?.quantity).toBe("333"));
  await act(async () => { resolve(utxos("222")); await first; });
  expect(view.result.current.summary.assets[0]?.quantity).toBe("333");
});
