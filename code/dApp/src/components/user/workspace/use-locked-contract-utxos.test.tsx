import { act, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import type { UTxO } from "@meshsdk/common";
import { activeAddressAtom, isConnectingAtom } from "@/providers/wallet.atoms";
import { createQueryTestWrapper } from "@/test/query-client";
import { queryKeys } from "@/lib/query/keys";

const chain = vi.hoisted(() => ({ fetchAddressUTxOs: vi.fn() }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { fetchAddressUTxOs = chain.fetchAddressUTxOs; } }));
vi.mock("./queries/wallet-identity.atoms", async () => {
  const { atom } = await import("jotai");
  const { activeAddressAtom } = await import("@/providers/wallet.atoms");
  return { lockingContractAtom: atom((get) => ({ address: get(activeAddressAtom), error: null })) };
});
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./queries/locked-utxos.atoms";
import { useLockedContractUtxos } from "./use-locked-contract-utxos";
import { resetWorkspaceDataAtom } from "./atoms/workspace-data.atoms";
import { resetAllFlowAtom } from "./atoms/transaction-flow.atoms";

const funds = (hash: string): UTxO[] => [{ input: { txHash: hash, outputIndex: 0 }, output: { address: "wallet", amount: [{ unit: "lovelace", quantity: "5000000" }] } }];
function setup(cached?: UTxO[]) {
  const context = createQueryTestWrapper();
  context.store.set(activeAddressAtom, "wallet-a");
  context.store.set(isConnectingAtom, true);
  if (cached) context.queryClient.setQueryData(queryKeys.addressUtxos("wallet-a"), cached);
  const hook = renderHook(() => ({ ...useLockedContractUtxos(), funds: useAtomValue(lockedContractUtxosAtom), loading: useAtomValue(lockedContractUtxosLoadingAtom), error: useAtomValue(lockedContractUtxosErrorAtom) }), { wrapper: context.wrapper });
  return { ...context, ...hook };
}
beforeEach(() => { chain.fetchAddressUTxOs.mockReset().mockResolvedValue(funds("a")); });

for (const found of [true, false]) {
  it(found ? "keeps checking briefly when a Send refresh finds no funds" : "settles after bounded empty-result retries", async () => {
    vi.useFakeTimers();
    const test = setup([]);
    try {
      chain.fetchAddressUTxOs.mockResolvedValue([]);
      if (found) chain.fetchAddressUTxOs.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(funds("funded"));
      let pending!: Promise<void>;
      await act(async () => { pending = test.result.current.refreshLockedContractUtxos("wallet-a", { retryEmpty: true }); });
      expect(test.result.current.loading).toBe(true);
      expect(chain.fetchAddressUTxOs).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(3_000); await pending; });
      expect(chain.fetchAddressUTxOs).toHaveBeenCalledTimes(found ? 3 : 4);
      expect(test.result.current.funds).toEqual(found ? funds("funded") : []);
      expect(test.result.current.loading).toBe(false);
    } finally { test.unmount(); test.queryClient.clear(); vi.useRealTimers(); }
  });
}

it("retires pending Send retries when the session ends", async () => {
  vi.useFakeTimers();
  const test = setup([]);
  try {
    chain.fetchAddressUTxOs.mockResolvedValue([]);
    let pending!: Promise<void>;
    await act(async () => { pending = test.result.current.refreshLockedContractUtxos("wallet-a", { retryEmpty: true }); });
    act(() => {
      test.store.set(resetAllFlowAtom);
      test.store.set(isConnectingAtom, false);
      test.store.set(resetWorkspaceDataAtom);
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); await pending; });
    expect(chain.fetchAddressUTxOs).toHaveBeenCalledTimes(1);
    expect(test.queryClient.getQueryData(queryKeys.addressUtxos("wallet-a"))).toBeUndefined();
    expect(test.result.current.loading).toBe(false);
  } finally { test.unmount(); test.queryClient.clear(); vi.useRealTimers(); }
});

it("clears visible funds immediately when the address changes", async () => {
  const test = setup();
  await waitFor(() => expect(test.result.current.funds).toEqual(funds("a")));
  let finish!: (value: UTxO[]) => void;
  chain.fetchAddressUTxOs.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  act(() => test.store.set(activeAddressAtom, "wallet-b"));
  expect(test.result.current.funds).toEqual([]);
  expect(test.result.current.loading).toBe(true);
  await act(async () => finish(funds("b")));
  await waitFor(() => expect(test.result.current.funds).toEqual(funds("b")));
});

it("an old read cannot overwrite another address or its loading state", async () => {
  let finishOld!: (value: UTxO[]) => void;
  let finishNew!: (value: UTxO[]) => void;
  chain.fetchAddressUTxOs.mockImplementation((address) => new Promise(resolve => {
    if (address === "wallet-a") finishOld = resolve; else finishNew = resolve;
  }));
  const test = setup();
  act(() => test.store.set(activeAddressAtom, "wallet-b"));
  await act(async () => finishOld(funds("old")));
  expect(test.result.current.funds).toEqual([]);
  expect(test.result.current.loading).toBe(true);
  await act(async () => finishNew(funds("new")));
  await waitFor(() => expect(test.result.current.funds).toEqual(funds("new")));
});

it("hides chain funds and errors after disconnect", async () => {
  const test = setup();
  await waitFor(() => expect(test.result.current.funds).toHaveLength(1));
  act(() => { test.store.set(isConnectingAtom, false); test.store.set(activeAddressAtom, null); });
  expect(test.result.current).toMatchObject({ funds: [], loading: false, error: null });
});

it("reuses a fresh address response after remount and retries an explicit refresh", async () => {
  const test = setup();
  await waitFor(() => expect(test.result.current.funds).toHaveLength(1));
  test.unmount();
  const next = renderHook(useLockedContractUtxos, { wrapper: test.wrapper });
  expect(chain.fetchAddressUTxOs).toHaveBeenCalledTimes(1);
  chain.fetchAddressUTxOs.mockRejectedValueOnce(new Error("offline"));
  await act(async () => next.result.current.refreshLockedContractUtxos("wallet-a"));
  expect(test.queryClient.getQueryData(queryKeys.addressUtxos("wallet-a"))).toEqual(funds("a"));
  await act(async () => next.result.current.refreshLockedContractUtxos("wallet-a"));
  expect(chain.fetchAddressUTxOs).toHaveBeenCalledTimes(3);
});
