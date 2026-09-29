import { act, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { activeAddressAtom, isConnectingAtom } from "@/providers/wallet.atoms";
import { invalidateChainQueries } from "@/lib/query/invalidation";

const chain = vi.hoisted(() => ({ fetchAddressTxs: vi.fn(), fetchTxInfo: vi.fn() }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { fetchAddressTxs = chain.fetchAddressTxs; fetchTxInfo = chain.fetchTxInfo; } }));
vi.mock("./queries/wallet-identity.atoms", async () => {
  const { atom } = await import("jotai");
  const { activeAddressAtom } = await import("@/providers/wallet.atoms");
  return { lockingContractAtom: atom((get) => ({ address: get(activeAddressAtom) })) };
});
vi.mock("./queries/token-identity.atoms", async () => ({ selectedDetectedTokenAtom: (await import("jotai")).atom(null) }));
vi.mock("./queries/activity-inputs.atoms", async () => ({ activityAnchorTxHashesAtom: (await import("jotai")).atom(["cd".repeat(32)]) }));
import { walletActivityQueryOptions, walletHistoryQueryKey, walletTransactionsAtom } from "./queries/activity-query.atoms";
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
it("a changed anchor set reuses fresh address history and reads only the new anchor", async () => {
  const { queryClient } = createQueryTestWrapper();
  const input = { walletAddress: "a", sttScriptAddress: null, sttUnit: null };
  await queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [transaction.hash] }, queryClient));
  await queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [transaction.hash, "ef".repeat(32)] }, queryClient));
  expect(chain.fetchAddressTxs).toHaveBeenCalledTimes(1);
  expect(chain.fetchTxInfo).toHaveBeenCalledTimes(2);
});
it("an explicit refresh pages address history again", async () => {
  const test = setup();
  await waitFor(() => expect(test.result.current.activity.loading).toBe(false));
  const pages = chain.fetchAddressTxs.mock.calls.length;
  await act(async () => { await test.result.current.refreshWalletTransactions(); });
  expect(chain.fetchAddressTxs.mock.calls.length).toBe(pages + 1);
});
it("lets the activity query own history retries", async () => {
  const { queryClient } = createQueryTestWrapper();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: 1, retryDelay: 0 } });
  chain.fetchAddressTxs.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
  const options = walletActivityQueryOptions({ walletAddress: "a", sttScriptAddress: null, sttUnit: null, anchorTxHashes: [] }, queryClient);
  await expect(queryClient.fetchQuery({ ...options, retry: 1, retryDelay: 0 })).rejects.toThrow("rate limited");
  expect(chain.fetchAddressTxs).toHaveBeenCalledTimes(2);
});
it("reads fresh history for every anchor set after one invalidation", async () => {
  const { queryClient } = createQueryTestWrapper();
  const input = { walletAddress: "a", sttScriptAddress: null, sttUnit: null };
  const touching = (hash: string) => ({ ...transaction, hash, outputs: [{ input: { txHash: hash, outputIndex: 0 }, output: { address: "a", amount: [] } }] });
  const old = touching("aa".repeat(32));
  const fresh = touching("ef".repeat(32));
  chain.fetchAddressTxs.mockResolvedValueOnce([old]);
  await queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [] }, queryClient));
  await queryClient.invalidateQueries({ queryKey: walletHistoryQueryKey(input), exact: true, refetchType: "none" });
  chain.fetchAddressTxs.mockResolvedValue([fresh]);
  const [first, second] = await Promise.all([
    queryClient.fetchQuery({ ...walletActivityQueryOptions({ ...input, anchorTxHashes: [] }, queryClient), staleTime: 0 }),
    queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [transaction.hash] }, queryClient))
  ]);
  expect(first.map(item => item.hash)).toEqual([fresh.hash]);
  expect(second.map(item => item.hash)).toContain(fresh.hash);
  expect(second.map(item => item.hash)).not.toContain(old.hash);
});
it("an older history read cannot overwrite history written after an invalidation", async () => {
  const { queryClient } = createQueryTestWrapper();
  const input = { walletAddress: "a", sttScriptAddress: null, sttUnit: null };
  const touching = (hash: string) => ({ ...transaction, hash, outputs: [{ input: { txHash: hash, outputIndex: 0 }, output: { address: "a", amount: [] } }] });
  const old = touching("aa".repeat(32));
  const fresh = touching("ef".repeat(32));
  let releaseOld!: (items: unknown[]) => void;
  chain.fetchAddressTxs.mockReturnValueOnce(new Promise((resolve) => { releaseOld = resolve; })).mockResolvedValueOnce([fresh]);
  const slow = queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [transaction.hash] }, queryClient));
  await queryClient.invalidateQueries({ queryKey: walletHistoryQueryKey(input), exact: true, refetchType: "none" });
  await queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [] }, queryClient));
  releaseOld([old]);
  await slow;
  expect(queryClient.getQueryData<{ hash: string }[]>(walletHistoryQueryKey(input))?.map((item) => item.hash)).toEqual([fresh.hash]);
});
it("a history read that spans a repeated chain invalidation does not write the slot", async () => {
  const { queryClient } = createQueryTestWrapper();
  const input = { walletAddress: "a", sttScriptAddress: null, sttUnit: null };
  const touching = (hash: string) => ({ ...transaction, hash, outputs: [{ input: { txHash: hash, outputIndex: 0 }, output: { address: "a", amount: [] } }] });
  const old = touching("aa".repeat(32));
  const fresh = touching("ef".repeat(32));
  chain.fetchAddressTxs.mockResolvedValueOnce([old]);
  await queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [] }, queryClient));
  await invalidateChainQueries(queryClient);
  let releaseOld!: (items: unknown[]) => void;
  chain.fetchAddressTxs.mockReturnValueOnce(new Promise((resolve) => { releaseOld = resolve; })).mockResolvedValueOnce([fresh]);
  const slow = queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [transaction.hash] }, queryClient));
  await invalidateChainQueries(queryClient);
  releaseOld([old]);
  await slow;
  const next = await queryClient.fetchQuery(walletActivityQueryOptions({ ...input, anchorTxHashes: [] }, queryClient));
  expect(next.map((item) => item.hash)).toEqual([fresh.hash]);
});
