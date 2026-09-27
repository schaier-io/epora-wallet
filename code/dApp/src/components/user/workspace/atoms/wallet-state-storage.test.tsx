import { createStore } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  beginWalletStateUpdateAtom, completeWalletStateUpdateAtom,
  pendingWalletStateUpdatesAtom, walletStateUpdatingAtom, WALLET_STATE_STORAGE_KEY
} from "./wallet-state-update.atoms";
import { routeStateAtom } from "./workspace-route.atoms";
import { sttInputTxHashAtom, sttInputOutputIndexAtom } from "./forms/stt-spend-form.atoms";

const first = { walletUnit: "aa".repeat(28) + "01", submittedTxHash: "cc".repeat(32), spentRef: { txHash: "dd".repeat(32), outputIndex: 0 } };
const second = { walletUnit: "bb".repeat(28) + "01", submittedTxHash: "ee".repeat(32), spentRef: { txHash: "ff".repeat(32), outputIndex: 0 } };
const replacementRef = { txHash: "12".repeat(32), outputIndex: 0 };
const WALLET_STATE_RECORD_PREFIX = WALLET_STATE_STORAGE_KEY.replace(/:v1$/, ":v2:");
const disposers: Array<() => void> = [];
const storageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;

beforeEach(() => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; }
  };
  Object.setPrototypeOf(storage, window.Storage.prototype);
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
  Object.defineProperty(window, "localStorage", storageDescriptor);
});
function storeFor(unit: string) {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: unit });
  disposers.push(store.sub(pendingWalletStateUpdatesAtom, () => {}));
  return store;
}
function storageEvent(key: string, newValue: string | null): StorageEvent {
  return { key, newValue, storageArea: window.localStorage } as StorageEvent;
}

it.each([false, true])("keeps different-wallet writes durable when storage events arrive reversed=%s", (reverse) => {
  const spy = vi.spyOn(window, "addEventListener");
  const a = storeFor(first.walletUnit);
  const b = storeFor(second.walletUnit);
  const listeners = spy.mock.calls.filter(([name]) => name === "storage").map(([, listener]) => listener as EventListener);
  expect(listeners).toHaveLength(2);
  const writes = vi.spyOn(window.localStorage, "setItem");
  a.set(beginWalletStateUpdateAtom, first);
  const eventA = storageEvent(...writes.mock.calls.at(-1)!);
  b.set(beginWalletStateUpdateAtom, second);
  const eventB = storageEvent(...writes.mock.calls.at(-1)!);
  const events = [() => listeners[1]!(eventA), () => listeners[0]!(eventB)];
  if (reverse) events.reverse();
  events.forEach(deliver => deliver());

  expect(a.get(walletStateUpdatingAtom)).toBe(true);
  expect(b.get(walletStateUpdatingAtom)).toBe(true);
  const expected = { [first.walletUnit]: first, [second.walletUnit]: second };
  expect(a.get(pendingWalletStateUpdatesAtom)).toEqual(expected);
  expect(b.get(pendingWalletStateUpdatesAtom)).toEqual(expected);
  expect(storeFor(first.walletUnit).get(pendingWalletStateUpdatesAtom)).toEqual(expected);
});

it("removes only its wallet despite a stale tab snapshot", () => {
  const a = storeFor(first.walletUnit);
  const b = storeFor(second.walletUnit);
  a.set(beginWalletStateUpdateAtom, first);
  b.set(beginWalletStateUpdateAtom, second);
  a.set(completeWalletStateUpdateAtom, { pending: first, replacementRef });

  expect(storeFor(second.walletUnit).get(pendingWalletStateUpdatesAtom)).toEqual({ [second.walletUnit]: second });
});

it("a completed legacy record does not return after reload or a delayed legacy rewrite", () => {
  const spy = vi.spyOn(window, "addEventListener");
  localStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify({ [first.walletUnit]: first, [second.walletUnit]: second }));
  const a = storeFor(first.walletUnit);
  expect(a.get(walletStateUpdatingAtom)).toBe(true);
  a.set(completeWalletStateUpdateAtom, { pending: first, replacementRef });
  expect(storeFor(second.walletUnit).get(pendingWalletStateUpdatesAtom)).toEqual({ [second.walletUnit]: second });

  localStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify({ [first.walletUnit]: first, [second.walletUnit]: second }));
  const listener = spy.mock.calls.find(([name]) => name === "storage")![1] as EventListener;
  listener(storageEvent(WALLET_STATE_STORAGE_KEY, JSON.stringify({ [first.walletUnit]: first })));
  expect(a.get(pendingWalletStateUpdatesAtom)).toEqual({ [second.walletUnit]: second });
  expect(storeFor(first.walletUnit).get(pendingWalletStateUpdatesAtom)).toEqual({ [second.walletUnit]: second });
});

it("a stale tab cannot complete a newer durable record before its storage event arrives", () => {
  const a = storeFor(first.walletUnit);
  a.set(beginWalletStateUpdateAtom, first);
  const b = storeFor(first.walletUnit);
  const newer = { ...first, submittedTxHash: "34".repeat(32) };
  b.set(beginWalletStateUpdateAtom, newer);
  expect(a.set(completeWalletStateUpdateAtom, { pending: first, replacementRef })).toBe(false);
  expect(storeFor(first.walletUnit).get(pendingWalletStateUpdatesAtom)[first.walletUnit]).toEqual(newer);
});

it("ignores malformed and other-network records while keeping valid legacy guards", () => {
  localStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify({ [first.walletUnit]: first }));
  localStorage.setItem(WALLET_STATE_RECORD_PREFIX + first.walletUnit, "malformed");
  localStorage.setItem(WALLET_STATE_RECORD_PREFIX + second.walletUnit, JSON.stringify({ ...second, invalidHereafter: -1 }));
  localStorage.setItem(`epora:other-network:pending-wallet-state:v2:${second.walletUnit}`, JSON.stringify(second));
  expect(storeFor(first.walletUnit).get(pendingWalletStateUpdatesAtom)).toEqual({ [first.walletUnit]: first });
});

it("keeps a guard and draft refs unchanged if persisting its completion fails", () => {
  const store = storeFor(first.walletUnit);
  store.set(sttInputTxHashAtom, first.spentRef.txHash);
  store.set(sttInputOutputIndexAtom, String(first.spentRef.outputIndex));
  store.set(beginWalletStateUpdateAtom, first);
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  expect(() => store.set(completeWalletStateUpdateAtom, { pending: first, replacementRef })).toThrow("Storage full");
  expect(store.get(walletStateUpdatingAtom)).toBe(true);
  expect(store.get(sttInputTxHashAtom)).toBe(first.spentRef.txHash);
  expect(store.get(sttInputOutputIndexAtom)).toBe(String(first.spentRef.outputIndex));
  expect(storeFor(first.walletUnit).get(pendingWalletStateUpdatesAtom)[first.walletUnit]).toEqual(first);
});
