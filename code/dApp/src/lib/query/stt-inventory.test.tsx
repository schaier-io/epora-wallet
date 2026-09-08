import { act, renderHook, waitFor } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DetectedSttInfo, DetectedSttToken } from "@/lib/mesh/detection";
import { createQueryTestWrapper } from "@/test/query-client";
import { queryKeys } from "./keys";
import { sttInventoryQueryOptions, sttWalletQueryOptions, type SttInventorySnapshot } from "./stt-inventory";
import { usePayeeInventory } from "@/components/payee/use-payee-inventory";
import {
  beginPayeeInputActionAtom, markPayeeInputSubmittedAtom,
  payeePendingInputKey, pendingPayeeInputActionsAtom
} from "@/components/payee/payee-pending-inputs.atoms";

const chain = vi.hoisted(() => ({ detect: vi.fn() }));
vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: chain.detect }));
vi.mock("@/lib/contracts/blueprint", () => ({ getSttMintPolicyId: () => "aa".repeat(28) }));
const policy = "aa".repeat(28);
const key = queryKeys.sttInventory(policy);
const a: DetectedSttToken = { policyId: policy, assetNameHex: "01", unit: `${policy}01`, scriptAddress: "script", datum: null,
  utxo: { input: { txHash: "11".repeat(32), outputIndex: 0 }, output: { address: "script", amount: [] } } };
const b = { ...a, unit: `${policy}02`, assetNameHex: "02" };
const info = (tokens: DetectedSttToken[]): DetectedSttInfo => ({ policyId: policy, assetNameHex: "", scriptAddress: "script", tokens, sttUtxos: tokens.map(t => t.utxo) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function reserve(context: ReturnType<typeof createQueryTestWrapper>) {
  const stateInput = `${a.utxo.input.txHash}#0`;
  const reservation = payeePendingInputKey(policy, stateInput);
  context.store.set(beginPayeeInputActionAtom, { policyId: policy, stateInput, streamKey: "stream", action: "collect" });
  context.store.set(markPayeeInputSubmittedAtom, { key: reservation, txHash: "submitted" });
  return reservation;
}
beforeEach(() => { chain.detect.mockReset().mockResolvedValue(info([])); });
afterEach(() => { onlineManager.setOnline(true); });

it("keeps a cold offline inventory pending instead of claiming an empty result", () => {
  onlineManager.setOnline(false);
  const context = createQueryTestWrapper();
  const { result, unmount } = renderHook(usePayeeInventory, { wrapper: context.wrapper });
  expect(result.current.loading).toBe(true);
  expect(context.queryClient.getQueryState(key)?.fetchStatus).toBe("paused");
  expect(chain.detect).not.toHaveBeenCalled();
  unmount();
  context.queryClient.clear();
});

it("requires a full scan after a targeted-only snapshot", async () => {
  const { queryClient } = createQueryTestWrapper();
  chain.detect.mockResolvedValueOnce(info([a])).mockResolvedValueOnce(info([a, b]));
  await queryClient.fetchQuery(sttWalletQueryOptions(policy, a.unit, queryClient));
  expect(queryClient.getQueryData<SttInventorySnapshot>(key)?.fullScanAt).toBeNull();
  const full = await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  expect(full.tokens).toEqual([a, b]);
  expect(chain.detect).toHaveBeenCalledTimes(2);
  expect(full.inventoryRead.kind).toBe("full");
});

it("does not renew full freshness or clear full invalidation with a targeted update", async () => {
  const { queryClient } = createQueryTestWrapper();
  chain.detect.mockResolvedValue(info([a]));
  const full = await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  const updatedAt = queryClient.getQueryState(key)?.dataUpdatedAt;
  await queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
  await queryClient.fetchQuery(sttWalletQueryOptions(policy, b.unit, queryClient, true));
  expect(queryClient.getQueryState(key)?.dataUpdatedAt).toBe(updatedAt);
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryData<SttInventorySnapshot>(key)?.fullScanAt).toBe(full.fullScanAt);
  await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  expect(chain.detect).toHaveBeenCalledTimes(3);
});

it("ignores an aborted full transport after a newer targeted State is accepted", async () => {
  const { queryClient } = createQueryTestWrapper();
  const old = deferred<DetectedSttInfo>();
  chain.detect.mockReturnValueOnce(old.promise).mockResolvedValueOnce(info([a]));
  const full = queryClient.fetchQuery(sttInventoryQueryOptions(policy)).catch(() => null);
  await queryClient.fetchQuery(sttWalletQueryOptions(policy, a.unit, queryClient, true));
  expect((chain.detect.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  old.resolve(info([]));
  await full;
  expect(queryClient.getQueryData<SttInventorySnapshot>(key)?.tokens).toEqual([a]);
  expect(queryClient.getQueryData<SttInventorySnapshot>(key)?.inventoryRead.kind).toBe("targeted");
});

it("ignores a late targeted transport after a newer full scan is accepted", async () => {
  const { queryClient } = createQueryTestWrapper();
  const old = deferred<DetectedSttInfo>();
  chain.detect.mockReturnValueOnce(old.promise).mockResolvedValueOnce(info([b]));
  const targeted = queryClient.fetchQuery(sttWalletQueryOptions(policy, a.unit, queryClient, true)).catch(() => null);
  await waitFor(() => expect(chain.detect).toHaveBeenCalledTimes(1));
  await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  old.resolve(info([a]));
  await targeted;
  expect(queryClient.getQueryData<SttInventorySnapshot>(key)?.tokens).toEqual([b]);
});

it("cannot release a reservation from a scan started before successful submission", async () => {
  const context = createQueryTestWrapper();
  const pending = deferred<DetectedSttInfo>();
  chain.detect.mockReturnValueOnce(pending.promise).mockResolvedValue(info([]));
  const { result } = renderHook(usePayeeInventory, { wrapper: context.wrapper });
  await waitFor(() => expect(chain.detect).toHaveBeenCalledTimes(1));
  const reservation = reserve(context);
  await act(async () => { pending.resolve(info([])); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(context.store.get(pendingPayeeInputActionsAtom)[reservation]?.phase).toBe("submitted");
  await act(async () => { await result.current.refresh(); });
  await waitFor(() => expect(context.store.get(pendingPayeeInputActionsAtom)[reservation]).toBeUndefined());
});

it("keeps submission ordering across Query removal and recreation", async () => {
  const context = createQueryTestWrapper();
  await context.queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  const reservation = reserve(context);
  context.queryClient.removeQueries({ queryKey: key, exact: true });
  const { result } = renderHook(usePayeeInventory, { wrapper: context.wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() => expect(context.store.get(pendingPayeeInputActionsAtom)[reservation]).toBeUndefined());
});

it("does not renew a selected cache from a cancelled full refetch's old snapshot", async () => {
  const { queryClient } = createQueryTestWrapper();
  const pending = deferred<DetectedSttInfo>();
  const newerA = { ...a, utxo: { ...a.utxo, input: { ...a.utxo.input, txHash: "new-a" } } };
  chain.detect.mockResolvedValueOnce(info([a, b])).mockReturnValueOnce(pending.promise)
    .mockImplementation((unit) => Promise.resolve(info(unit === a.unit ? [newerA] : [b])));
  await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  const full = queryClient.fetchQuery({ ...sttInventoryQueryOptions(policy), staleTime: 0 });
  const selected = queryClient.fetchQuery(sttWalletQueryOptions(policy, a.unit, queryClient));
  await queryClient.fetchQuery(sttWalletQueryOptions(policy, b.unit, queryClient, true));
  expect((await selected).tokens).toEqual([newerA]);
  pending.resolve(info([a, b]));
  await full;
  expect(queryClient.getQueryData<SttInventorySnapshot>(key)?.tokens).toContainEqual(newerA);
});


it("validates a targeted unit before a full cache can satisfy it", async () => {
  const { queryClient } = createQueryTestWrapper();
  await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  await expect(queryClient.fetchQuery(sttWalletQueryOptions(policy, "not-a-wallet", queryClient)))
    .rejects.toThrow("The requested wallet asset does not match the current STT policy.");
  expect(chain.detect).toHaveBeenCalledTimes(1);
});

it("releases the navigation observer when explicit cancellation aborts an unresponsive transport", async () => {
  const { queryClient } = createQueryTestWrapper();
  chain.detect.mockReturnValue(new Promise(() => {}));
  const read = queryClient.fetchQuery(sttInventoryQueryOptions(policy)).catch(() => null);
  expect(queryClient.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount()).toBe(1);
  await queryClient.cancelQueries({ queryKey: key, exact: true });
  await read;
  expect(queryClient.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount()).toBe(0);
});


it("keeps a shared full read alive through its configured retry", async () => {
  const { queryClient } = createQueryTestWrapper();
  chain.detect.mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValueOnce(info([a]));
  const result = await queryClient.fetchQuery({ ...sttInventoryQueryOptions(policy), retry: 1, retryDelay: 30 });
  expect(result.tokens).toEqual([a]);
  expect(chain.detect).toHaveBeenCalledTimes(2);
});

it("joins a pending manual full refresh even while the previous full cache is still fresh", async () => {
  const { queryClient } = createQueryTestWrapper();
  const pending = deferred<DetectedSttInfo>();
  const next = { ...a, utxo: { ...a.utxo, input: { ...a.utxo.input, txHash: "new-a" } } };
  chain.detect.mockResolvedValueOnce(info([a])).mockReturnValueOnce(pending.promise).mockResolvedValue(info([a]));
  await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  const full = queryClient.fetchQuery({ ...sttInventoryQueryOptions(policy), staleTime: 0 });
  const selected = queryClient.fetchQuery(sttWalletQueryOptions(policy, a.unit, queryClient));
  await Promise.resolve();
  await Promise.resolve();
  expect(chain.detect).toHaveBeenCalledTimes(2);
  expect((chain.detect.mock.calls[1][1] as AbortSignal).aborted).toBe(false);
  pending.resolve(info([next]));
  expect((await selected).tokens).toEqual([next]);
  await full;
});

it("does not erase a known selected State when fresh full coverage misses its successor", async () => {
  const { queryClient } = createQueryTestWrapper();
  chain.detect.mockResolvedValueOnce(info([a])).mockResolvedValueOnce(info([])).mockResolvedValue(info([]));
  await queryClient.fetchQuery(sttWalletQueryOptions(policy, a.unit, queryClient, true));
  await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  await queryClient.invalidateQueries({ queryKey: queryKeys.sttWallet(policy, a.unit), exact: true, refetchType: "none" });
  await expect(queryClient.fetchQuery(sttWalletQueryOptions(policy, a.unit, queryClient)))
    .rejects.toThrow("State token not indexed yet");
  expect(queryClient.getQueryData<DetectedSttInfo>(queryKeys.sttWallet(policy, a.unit))?.tokens).toEqual([a]);
  expect(chain.detect).toHaveBeenCalledTimes(3);
});

it("looks up a new selected wallet absent from fresh full coverage", async () => {
  const { queryClient } = createQueryTestWrapper();
  chain.detect.mockResolvedValueOnce(info([a])).mockResolvedValueOnce(info([b]));
  await queryClient.fetchQuery(sttInventoryQueryOptions(policy));
  expect(queryClient.getQueryData(queryKeys.sttWallet(policy, b.unit))).toBeUndefined();

  const selected = await queryClient.fetchQuery(sttWalletQueryOptions(policy, b.unit, queryClient));

  expect(selected.tokens).toEqual([b]);
  expect(chain.detect).toHaveBeenCalledTimes(2);
  expect(chain.detect).toHaveBeenNthCalledWith(1, undefined, expect.any(AbortSignal));
  expect(chain.detect).toHaveBeenNthCalledWith(2, b.unit, expect.any(AbortSignal));
  expect(queryClient.getQueryData<SttInventorySnapshot>(key)?.tokens).toEqual([a, b]);
});
