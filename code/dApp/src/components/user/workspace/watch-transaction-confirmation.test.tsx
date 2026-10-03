import { createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { afterEach, expect, it, vi } from "vitest";
import { activeAddressAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { readDepositReceipt, saveDepositReceipt } from "./deposit-receipt";
import { createAppQueryClient } from "@/lib/query/client";
import { submitHashAtom } from "./atoms/transaction-flow.atoms";
import { SUBMIT_CONFIRMATION_INITIAL_DELAY_MS, SUBMIT_CONFIRMATION_MAX_ATTEMPTS, SUBMIT_CONFIRMATION_POLL_MS, SUBMIT_CONFIRMATION_LATE_MAX_ATTEMPTS, SUBMIT_CONFIRMATION_LATE_POLL_MS } from "./constants";
import { watchTransactionConfirmation } from "./watch-transaction-confirmation";

vi.mock("@/lib/query/invalidation", () => ({ invalidateChainQueries: vi.fn(async () => {}) }));
afterEach(() => vi.useRealTimers());

it("retires the saved deposit after confirmation without erasing a newer receipt", async () => {
  vi.useFakeTimers();
  const store = createStore();
  const client = createAppQueryClient();
  store.set(queryClientAtom, client);
  vi.spyOn(client, "fetchQuery").mockResolvedValue({});
  const owner = { address: "account-a", network: 0, walletUnit: "ab".repeat(28) + "01" };
  store.set(activeAddressAtom, owner.address);
  store.set(networkIdAtom, owner.network);
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: owner.walletUnit });
  const hash = "aa".repeat(32);
  saveDepositReceipt(owner, hash);
  store.set(submitHashAtom, hash);
  const watch = watchTransactionConfirmation(store, hash, "lock-funds");
  await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS);
  await watch;
  expect(readDepositReceipt(owner)).toBeNull();
  expect(store.get(submitHashAtom)).toBe(hash);
  const newerHash = "bb".repeat(32);
  saveDepositReceipt(owner, newerHash);
  const oldWatch = watchTransactionConfirmation(store, hash, "lock-funds");
  await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS);
  await oldWatch;
  expect(readDepositReceipt(owner)?.txHash).toBe(newerHash);
  client.clear();
});

it("shares active polling after a local reset and permits a retry after polling settles", async () => {
  vi.useFakeTimers();
  const store = createStore();
  const client = createAppQueryClient();
  store.set(queryClientAtom, client);
  const fetch = vi.spyOn(client, "fetchQuery").mockResolvedValue({});
  const hash = "aa".repeat(32);
  store.set(submitHashAtom, hash);
  const first = watchTransactionConfirmation(store, hash, "lock-funds");
  store.set(submitHashAtom, null);
  store.set(submitHashAtom, hash);
  const duplicate = watchTransactionConfirmation(store, hash, "lock-funds");
  await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS);
  await Promise.all([first, duplicate]);
  expect(fetch).toHaveBeenCalledTimes(1);
  const retry = watchTransactionConfirmation(store, hash, "lock-funds");
  await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS);
  await retry;
  expect(fetch).toHaveBeenCalledTimes(2);
  client.clear();
});

it("starts a new watch for the same hash after the wallet session changes", async () => {
  vi.useFakeTimers();
  const store = createStore();
  const client = createAppQueryClient();
  store.set(queryClientAtom, client);
  const fetch = vi.spyOn(client, "fetchQuery").mockResolvedValue({});
  const hash = "aa".repeat(32);
  store.set(submitHashAtom, hash);
  const first = watchTransactionConfirmation(store, hash, "lock-funds");
  store.set(activeAddressAtom, "new-account");
  const next = watchTransactionConfirmation(store, hash, "lock-funds");
  await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS);
  await Promise.all([first, next]);
  expect(fetch).toHaveBeenCalledTimes(1);
  client.clear();
});

it("retries a receipt after both bounded polling windows expire", async () => {
  vi.useFakeTimers();
  const store = createStore();
  const client = createAppQueryClient();
  store.set(queryClientAtom, client);
  const fetch = vi.spyOn(client, "fetchQuery").mockResolvedValue(null);
  const hash = "aa".repeat(32);
  store.set(submitHashAtom, hash);
  const first = watchTransactionConfirmation(store, hash, "lock-funds");
  await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS +
    (SUBMIT_CONFIRMATION_MAX_ATTEMPTS - 1) * SUBMIT_CONFIRMATION_POLL_MS +
    SUBMIT_CONFIRMATION_LATE_MAX_ATTEMPTS * SUBMIT_CONFIRMATION_LATE_POLL_MS);
  await first;
  const attempts = fetch.mock.calls.length;
  expect(attempts).toBe(SUBMIT_CONFIRMATION_MAX_ATTEMPTS + SUBMIT_CONFIRMATION_LATE_MAX_ATTEMPTS);
  fetch.mockResolvedValue({});
  const retry = watchTransactionConfirmation(store, hash, "lock-funds");
  await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS);
  await retry;
  expect(fetch).toHaveBeenCalledTimes(attempts + 1);
  client.clear();
});
