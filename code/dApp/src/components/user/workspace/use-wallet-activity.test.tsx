import { act, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { activeAddressAtom, isConnectingAtom } from "@/providers/wallet.atoms";

const chain = vi.hoisted(() => ({ fetchAddressTxs: vi.fn(), fetchTxInfo: vi.fn() }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { fetchAddressTxs = chain.fetchAddressTxs; fetchTxInfo = chain.fetchTxInfo; } }));
vi.mock("./queries/wallet-identity.atoms", async () => {
  const { atom } = await import("jotai");
  const { activeAddressAtom } = await import("@/providers/wallet.atoms");
  return { lockingContractAtom: atom((get) => ({ address: get(activeAddressAtom) })) };
});
vi.mock("./queries/token-identity.atoms", async () => ({ selectedDetectedTokenAtom: (await import("jotai")).atom(null) }));
vi.mock("./queries/activity-inputs.atoms", async () => ({ activityAnchorTxHashesAtom: (await import("jotai")).atom(["cd".repeat(32)]) }));
import { walletActivityQueryOptions, walletTransactionsAtom } from "./queries/activity-query.atoms";
import { useWalletActivity } from "./use-wallet-activity";
const transaction = { hash: "cd".repeat(32), inputs: [], outputs: [], blockTime: 1, slot: "1" };
beforeEach(() => {
  chain.fetchAddressTxs.mockReset().mockResolvedValue([]);
  chain.fetchTxInfo.mockReset().mockResolvedValue(transaction);
});
function setup() {
  const context = createQueryTestWrapper();
  context.store.set(isConnectingAtom, true);
  context.store.set(activeAddressAtom, "wallet-a");
  return { ...context, ...renderHook(() => ({ ...useWalletActivity(), activity: useAtomValue(walletTransactionsAtom) }), { wrapper: context.wrapper }) };
}
it("loads the creation transaction when a wallet has empty address history", async () => {
  const test = setup();
  await waitFor(() => expect(test.result.current.activity.loading).toBe(false));
  expect(test.result.current.activity).toMatchObject({ items: [transaction], error: null });
  expect(chain.fetchTxInfo).toHaveBeenCalledTimes(1);
});
it("shares transaction details and ignores duplicate or reordered anchors", async () => {
  const { queryClient } = createQueryTestWrapper();
  const first = walletActivityQueryOptions({ walletAddress: "a", sttScriptAddress: null, sttUnit: null, anchorTxHashes: ["cd".repeat(32), "cd".repeat(32)] }, queryClient);
  const second = walletActivityQueryOptions({ walletAddress: "b", sttScriptAddress: null, sttUnit: null, anchorTxHashes: ["cd".repeat(32)] }, queryClient);
  await Promise.all([queryClient.fetchQuery(first), queryClient.fetchQuery(second)]);
  expect(chain.fetchTxInfo).toHaveBeenCalledTimes(1);
  expect(first.queryKey).toEqual(walletActivityQueryOptions({ walletAddress: "a", sttScriptAddress: null, sttUnit: null, anchorTxHashes: ["cd".repeat(32)] }, queryClient).queryKey);
});
it("an unmounted activity request cannot overwrite the next wallet", async () => {
  let finish!: (value: unknown[]) => void;
  chain.fetchAddressTxs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = setup();
  first.unmount();
  act(() => first.store.set(activeAddressAtom, "wallet-b"));
  const next = renderHook(() => ({ ...useWalletActivity(), activity: useAtomValue(walletTransactionsAtom) }), { wrapper: first.wrapper });
  await waitFor(() => expect(next.result.current.activity.loading).toBe(false));
  await act(async () => finish([{ ...transaction, hash: "ab".repeat(32) }]));
  expect(next.result.current.activity.items).toEqual([transaction]);
});
it("reuses the full transaction details already returned with address history", async () => {
  const history = { ...transaction, fees: "100", size: 200, outputs: [{ input: { txHash: transaction.hash, outputIndex: 0 }, output: { address: "wallet-a", amount: [] } }] };
  chain.fetchAddressTxs.mockResolvedValue([history]);
  const test = setup();
  await waitFor(() => expect(test.result.current.activity.items).toEqual([history]));
  expect(chain.fetchTxInfo).not.toHaveBeenCalled();
});
it("keeps the last feed after detail throttling and allows an explicit retry", async () => {
  const test = setup();
  await waitFor(() => expect(test.result.current.activity.items).toEqual([transaction]));
  await test.queryClient.invalidateQueries({ queryKey: ["chain", "preprod", "transaction"], refetchType: "none" });
  chain.fetchTxInfo.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }));
  await act(async () => { await test.result.current.refreshWalletTransactions(); });
  await waitFor(() => expect(test.result.current.activity.error).not.toBeNull());
  expect(test.result.current.activity.items).toEqual([transaction]);
  await act(async () => { await test.result.current.refreshWalletTransactions(); });
  await waitFor(() => expect(test.result.current.activity.error).toBeNull());
});
it("treats only a missing transaction as an empty anchor", async () => {
  const { queryClient } = createQueryTestWrapper();
  chain.fetchTxInfo.mockRejectedValueOnce(Object.assign(new Error("not indexed"), { status: 404 }));
  expect(await queryClient.fetchQuery(walletActivityQueryOptions({ walletAddress: "a", sttScriptAddress: null, sttUnit: null, anchorTxHashes: [transaction.hash] }, queryClient))).toEqual([]);
  chain.fetchTxInfo.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }));
  await expect(queryClient.fetchQuery(walletActivityQueryOptions({ walletAddress: "b", sttScriptAddress: null, sttUnit: null, anchorTxHashes: [transaction.hash] }, queryClient))).rejects.toThrow("unavailable");
});
