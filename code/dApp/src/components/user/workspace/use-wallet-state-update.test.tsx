import { act, cleanup, render } from "@testing-library/react";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DetectedSttInfo } from "@/lib/mesh/detection";
import { STT_STATE_REFRESH_FAST_ATTEMPTS, STT_STATE_REFRESH_MAX_POLL_MS, STT_STATE_REFRESH_POLL_MS, WALLET_STATE_UNSEEN_RELEASE_MS } from "./constants";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import {
  walletStateChecksAtom, pendingWalletStateUpdateAtom, pendingWalletStateUpdatesAtom, WALLET_STATE_STORAGE_KEY, WALLET_STATE_RECORD_PREFIX,
  walletStateRetryAtom, type PendingWalletStateUpdate, type SttInputRef
} from "./atoms/wallet-state-update.atoms";
import { sttInputTxHashAtom, sttInputOutputIndexAtom } from "./atoms/forms/stt-spend-form.atoms";

const mocks = vi.hoisted(() => ({ detectSttInfo: vi.fn() }));
vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: mocks.detectSttInfo }));

import { readUsableWalletReplacement, useWalletStateUpdate } from "./use-wallet-state-update";

const POLICY = "12".repeat(28);
const UNIT = `${POLICY}01`;
const SPENT = { txHash: "ab".repeat(32), outputIndex: 1 };
const NEXT = { txHash: "cd".repeat(32), outputIndex: 2 };
const PENDING: PendingWalletStateUpdate = { walletUnit: UNIT, spentRef: SPENT, submittedTxHash: NEXT.txHash };
const clients: QueryClient[] = [];

function client() {
  const result = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(result);
  return result;
}

function detected(input: SttInputRef): DetectedSttInfo {
  const utxo = { input, output: { address: "addr_test1state", amount: [{ unit: UNIT, quantity: "1" }] } };
  return {
    policyId: POLICY, assetNameHex: "01", scriptAddress: "addr_test1state", sttUtxos: [utxo],
    tokens: [{ policyId: POLICY, assetNameHex: "01", unit: UNIT, scriptAddress: "addr_test1state", utxo, datum: null }]
  };
}

type RpcOptions = {
  confirmed?: boolean; slot?: unknown; consumedBy?: string | null; unknownStatus?: boolean;
  confirmedTxHash?: string; originalConsumedBy?: string; inMempool?: boolean; mempoolFails?: boolean;
};
function rpc(options: RpcOptions = {}) {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { method, args } = JSON.parse(String(init?.body)) as { method: string; args: string[] };
    if (method === "fetchTxInfo") {
      return options.confirmed === false && args[0] !== options.confirmedTxHash
        ? new Response(JSON.stringify({ error: "Transaction not indexed" }), { status: 404 })
        : Response.json({ result: { hash: args[0] } });
    }
    if (method === "get" && args[0]?.startsWith("mempool/")) {
      if (options.mempoolFails) return new Response(JSON.stringify({ error: "Upstream failed" }), { status: 502 });
      return options.inMempool
        ? Response.json({ result: { tx: { hash: args[0].slice("mempool/".length) } } })
        : new Response(JSON.stringify({ error: "Not in mempool" }), { status: 404 });
    }
    if (method === "get" && args[0] === "blocks/latest") return Response.json({ result: { slot: options.slot } });
    if (method === "get" && args[0]?.startsWith("txs/")) {
      const index = args[0].includes(SPENT.txHash) ? SPENT.outputIndex : NEXT.outputIndex;
      const consumedBy = args[0].includes(SPENT.txHash)
        ? options.originalConsumedBy ?? options.consumedBy : options.consumedBy;
      return Response.json({ result: { outputs: [{ output_index: index,
        ...(options.unknownStatus ? {} : { consumed_by_tx: consumedBy ?? null }) }] } });
    }
    throw new Error(`Unexpected RPC ${method}: ${args[0]}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  focusManager.setFocused(true);
  localStorage.clear();
  mocks.detectSttInfo.mockReset().mockResolvedValue(detected(NEXT));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(queryClient => queryClient.clear());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
  localStorage.clear();
});

it("#433 rejects a changed STT reference when the output is already spent", async () => {
  rpc({ consumedBy: "ef".repeat(32) });
  await expect(readUsableWalletReplacement(client(), PENDING, new AbortController().signal))
    .rejects.toThrow("was already spent by");
});

it("#433 rejects a replacement whose unspent status is unknown", async () => {
  rpc({ unknownStatus: true });
  await expect(readUsableWalletReplacement(client(), PENDING, new AbortController().signal))
    .rejects.toThrow("has no verified unspent status");
});

it("#433 keeps waiting when detection still returns the original reference", async () => {
  const fetch = rpc();
  mocks.detectSttInfo.mockResolvedValue(detected(SPENT));
  await expect(readUsableWalletReplacement(client(), PENDING, new AbortController().signal)).resolves.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("#433 accepts only a changed reference with explicit unspent status", async () => {
  const fetch = rpc();
  await expect(readUsableWalletReplacement(client(), PENDING, new AbortController().signal))
    .resolves.toEqual({ replacementRef: NEXT, expired: false });
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({ method: "get", args: [`txs/${NEXT.txHash}/utxos`] });
});

it("#433 follows a confirmed competing spender when our candidate never appears", async () => {
  const winner = { txHash: "ef".repeat(32), outputIndex: NEXT.outputIndex };
  const fetch = rpc({ confirmed: false, confirmedTxHash: winner.txHash, originalConsumedBy: winner.txHash });
  mocks.detectSttInfo.mockResolvedValue(detected(winner));
  await expect(readUsableWalletReplacement(client(), PENDING, new AbortController().signal))
    .resolves.toEqual({ replacementRef: winner, expired: false });
  expect(fetch.mock.calls.map(([, init]): unknown => JSON.parse(String(init?.body)))).toEqual([
    { method: "fetchTxInfo", args: [PENDING.submittedTxHash] },
    { method: "get", args: [`txs/${SPENT.txHash}/utxos`] },
    { method: "fetchTxInfo", args: [winner.txHash] },
    { method: "get", args: [`txs/${winner.txHash}/utxos`] }
  ]);
});

it("#433 keeps waiting when the competing spender is not yet confirmed", async () => {
  rpc({ confirmed: false, originalConsumedBy: "ef".repeat(32) });
  await expect(readUsableWalletReplacement(client(), PENDING, new AbortController().signal))
    .rejects.toThrow("Transaction not indexed");
  expect(mocks.detectSttInfo).not.toHaveBeenCalled();
});

it("#433 does not expire an uncertain submission from browser time or an earlier chain slot", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
  rpc({ confirmed: false, slot: 999 });
  await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000 }, new AbortController().signal))
    .resolves.toBeNull();
  expect(mocks.detectSttInfo).not.toHaveBeenCalled();
});

it.each([null, 999.5, "1000"])("#433 rejects invalid chain slot %s for expiry", async slot => {
  rpc({ confirmed: false, slot });
  await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000 }, new AbortController().signal)).rejects.toThrow();
});

it.each([{ consumedBy: "ef".repeat(32) }, { unknownStatus: true }])(
  "#433 keeps an expired submission locked without a verified unspent original input: %j", async status => {
    rpc({ confirmed: false, slot: 1000, ...status });
    await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000 }, new AbortController().signal)).rejects.toThrow();
  }
);

it("#433 releases an expired submission only at its chain slot with the original input unspent", async () => {
  rpc({ confirmed: false, slot: 1000 });
  await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000 }, new AbortController().signal))
    .resolves.toEqual({ replacementRef: SPENT, expired: true });
  expect(mocks.detectSttInfo).not.toHaveBeenCalled();
});

it("releases a submission the chain still does not know a few minutes after submit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T03:43:00Z"));
  rpc({ confirmed: false, slot: 999 });
  const submittedAt = Date.now() - WALLET_STATE_UNSEEN_RELEASE_MS;
  await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000, submittedAt }, new AbortController().signal))
    .resolves.toEqual({ replacementRef: SPENT, expired: true });
  expect(mocks.detectSttInfo).not.toHaveBeenCalled();
});

it("keeps an unseen submission locked while the provider's mempool still holds it", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T03:43:00Z"));
  rpc({ confirmed: false, slot: 999, inMempool: true });
  const submittedAt = Date.now() - WALLET_STATE_UNSEEN_RELEASE_MS;
  await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000, submittedAt }, new AbortController().signal))
    .resolves.toBeNull();
});

it("falls back to the validity window when the mempool read fails", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T03:43:00Z"));
  const submittedAt = Date.now() - WALLET_STATE_UNSEEN_RELEASE_MS;
  rpc({ confirmed: false, slot: 999, mempoolFails: true });
  await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000, submittedAt }, new AbortController().signal))
    .resolves.toBeNull();
  rpc({ confirmed: false, slot: 1000, mempoolFails: true });
  await expect(readUsableWalletReplacement(client(), { ...PENDING, invalidHereafter: 1000, submittedAt }, new AbortController().signal))
    .resolves.toEqual({ replacementRef: SPENT, expired: true });
});

it("keeps an unseen submission locked before the release time or with its unspent status unverified", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T03:43:00Z"));
  rpc({ confirmed: false, slot: 999 });
  const early = { ...PENDING, invalidHereafter: 1000, submittedAt: Date.now() - WALLET_STATE_UNSEEN_RELEASE_MS + 1 };
  await expect(readUsableWalletReplacement(client(), early, new AbortController().signal)).resolves.toBeNull();
  rpc({ confirmed: false, slot: 999, unknownStatus: true });
  const late = { ...PENDING, invalidHereafter: 1000, submittedAt: Date.now() - WALLET_STATE_UNSEEN_RELEASE_MS };
  await expect(readUsableWalletReplacement(client(), late, new AbortController().signal)).rejects.toThrow();
});

function Reader() { useWalletStateUpdate(); return null; }

it("#433 resumes a persisted wait on the landing screen without a selected wallet", async () => {
  vi.useFakeTimers();
  rpc();
  localStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify({ [UNIT]: PENDING }));
  const store = createStore();
  store.set(queryClientAtom, client());
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams()));
  render(<Provider store={store}><Reader /></Provider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(mocks.detectSttInfo).toHaveBeenCalledWith(UNIT, expect.any(AbortSignal));
  expect(store.get(pendingWalletStateUpdatesAtom)).toEqual({});
  expect(localStorage.getItem(WALLET_STATE_RECORD_PREFIX + UNIT)).toBe("null");
  expect(createStore().get(pendingWalletStateUpdatesAtom)).toEqual({});
});

it("#433 resumes persisted state for the selected wallet and waits beyond ten polls before unlocking", async () => {
  vi.useFakeTimers();
  rpc();
  const other = { ...PENDING, walletUnit: `${POLICY}02` };
  localStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify({ [UNIT]: PENDING, [other.walletUnit]: other }));
  const store = createStore();
  store.set(queryClientAtom, client());
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams({ wallet: UNIT })));
  store.set(sttInputTxHashAtom, SPENT.txHash);
  store.set(sttInputOutputIndexAtom, String(SPENT.outputIndex));
  mocks.detectSttInfo.mockResolvedValue(detected(SPENT));
  render(<Provider store={store}><Reader /></Provider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(STT_STATE_REFRESH_POLL_MS * 11); });
  expect(mocks.detectSttInfo.mock.calls.length).toBeGreaterThan(10);
  expect(store.get(pendingWalletStateUpdatesAtom)[UNIT]).toEqual(PENDING);
  expect(store.get(sttInputTxHashAtom)).toBe(SPENT.txHash);
  mocks.detectSttInfo.mockResolvedValue(detected(NEXT));
  await act(async () => { await vi.advanceTimersByTimeAsync(STT_STATE_REFRESH_POLL_MS); });
  expect(store.get(pendingWalletStateUpdatesAtom)[UNIT]).toBeUndefined();
  expect(store.get(pendingWalletStateUpdatesAtom)[other.walletUnit]).toEqual(other);
  expect(store.get(sttInputTxHashAtom)).toBe(NEXT.txHash);
  expect(store.get(sttInputOutputIndexAtom)).toBe(String(NEXT.outputIndex));
  expect(localStorage.getItem(WALLET_STATE_RECORD_PREFIX + UNIT)).toBe("null");
  expect(createStore().get(pendingWalletStateUpdatesAtom)).toEqual({ [other.walletUnit]: other });
});

it("shares a confirmed transaction read through the txInfo query cache", async () => {
  const fetch = rpc({ consumedBy: null });
  const queryClient = client();
  const txInfoCalls = () => fetch.mock.calls.filter(([, init]) =>
    (JSON.parse(String(init?.body)) as { method: string }).method === "fetchTxInfo").length;

  await readUsableWalletReplacement(queryClient, PENDING, new AbortController().signal);
  await readUsableWalletReplacement(queryClient, PENDING, new AbortController().signal);
  expect(txInfoCalls()).toBe(1);
});

it("keeps polling an unindexed transaction instead of caching the miss", async () => {
  const fetch = rpc({ confirmed: false });
  const queryClient = client();
  const txInfoCalls = () => fetch.mock.calls.filter(([, init]) =>
    (JSON.parse(String(init?.body)) as { method: string }).method === "fetchTxInfo").length;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await readUsableWalletReplacement(queryClient, { ...PENDING, invalidHereafter: 10 },
      new AbortController().signal).catch(() => null);
  }
  expect(txInfoCalls()).toBe(2);
});


it("does not carry a previous transaction's successful check into a new failed check", async () => {
  vi.useFakeTimers();
  rpc({ confirmed: false, slot: null });
  const store = createStore();
  store.set(queryClientAtom, client());
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams(`wallet=${UNIT}`)));
  store.set(walletStateChecksAtom, { [UNIT]: { txHash: "previous", checkedAt: 100, lastSuccessfulAt: 100, phase: "waiting" } });
  store.set(pendingWalletStateUpdateAtom, { ...PENDING, invalidHereafter: 1000 });
  render(<Provider store={store}><Reader /></Provider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(store.get(walletStateChecksAtom)[UNIT]).toMatchObject({ txHash: PENDING.submittedTxHash, phase: "unavailable", lastSuccessfulAt: null });
});

it("pauses pending checks while hidden or idle and checks immediately on resume or retry", async () => {
  vi.useFakeTimers();
  const fetch = rpc({ confirmed: false });
  const store = createStore();
  store.set(queryClientAtom, client());
  store.set(pendingWalletStateUpdateAtom, PENDING);
  render(<Provider store={store}><Reader /></Provider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const initialCalls = fetch.mock.calls.length;
  act(() => focusManager.setFocused(false));
  await act(async () => { await vi.advanceTimersByTimeAsync(STT_STATE_REFRESH_MAX_POLL_MS * 2); });
  expect(fetch).toHaveBeenCalledTimes(initialCalls);
  expect(store.get(pendingWalletStateUpdatesAtom)[UNIT]).toEqual(PENDING);

  await act(async () => { focusManager.setFocused(true); await vi.advanceTimersByTimeAsync(0); });
  expect(fetch.mock.calls.length).toBeGreaterThan(initialCalls);
  const resumedCalls = fetch.mock.calls.length;
  await act(async () => { store.set(walletStateRetryAtom, value => value + 1); await vi.advanceTimersByTimeAsync(0); });
  expect(fetch.mock.calls.length).toBeGreaterThan(resumedCalls);
});

it("backs off a persistent pending check without releasing its safety lock", async () => {
  vi.useFakeTimers();
  const fetch = rpc({ confirmed: false });
  const store = createStore();
  store.set(queryClientAtom, client());
  store.set(pendingWalletStateUpdateAtom, PENDING);
  render(<Provider store={store}><Reader /></Provider>);
  const txReads = () => fetch.mock.calls.filter(([, init]) =>
    (JSON.parse(String(init?.body)) as { method: string }).method === "fetchTxInfo").length;
  await act(async () => { await vi.advanceTimersByTimeAsync(STT_STATE_REFRESH_POLL_MS * STT_STATE_REFRESH_FAST_ATTEMPTS); });
  expect(txReads()).toBe(STT_STATE_REFRESH_FAST_ATTEMPTS + 1);
  await act(async () => { await vi.advanceTimersByTimeAsync(STT_STATE_REFRESH_MAX_POLL_MS * 3); });
  const reads = txReads();
  await act(async () => { await vi.advanceTimersByTimeAsync(STT_STATE_REFRESH_MAX_POLL_MS); });
  expect(txReads() - reads).toBe(1);
  expect(store.get(pendingWalletStateUpdatesAtom)[UNIT]).toEqual(PENDING);
});
