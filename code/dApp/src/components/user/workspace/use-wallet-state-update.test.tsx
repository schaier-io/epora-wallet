import { act, cleanup, render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { Provider, createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DetectedSttInfo } from "@/lib/mesh/detection";
import { STT_STATE_REFRESH_POLL_MS } from "./constants";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import {
  pendingWalletStateUpdatesAtom, WALLET_STATE_STORAGE_KEY,
  type PendingWalletStateUpdate, type SttInputRef
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
  confirmedTxHash?: string; originalConsumedBy?: string;
};
function rpc(options: RpcOptions = {}) {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { method, args } = JSON.parse(String(init?.body)) as { method: string; args: string[] };
    if (method === "fetchTxInfo") {
      return options.confirmed === false && args[0] !== options.confirmedTxHash
        ? new Response(JSON.stringify({ error: "Transaction not indexed" }), { status: 404 })
        : Response.json({ result: { hash: args[0] } });
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
  localStorage.clear();
  mocks.detectSttInfo.mockReset().mockResolvedValue(detected(NEXT));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(queryClient => queryClient.clear());
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
  expect(fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
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
    .rejects.toThrow("Transaction not indexed");
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

function Reader() { useWalletStateUpdate(); return null; }

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
  expect(JSON.parse(localStorage.getItem(WALLET_STATE_STORAGE_KEY)!)).toEqual({ [other.walletUnit]: other });
});
