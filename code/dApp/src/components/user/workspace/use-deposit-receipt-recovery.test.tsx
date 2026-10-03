import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import type { BrowserWallet } from "@meshsdk/core";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { activeAddressAtom, activeWalletAtom, activeWalletNameAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { createAppQueryClient } from "@/lib/query/client";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { activeSubmitAtom, submitConfirmedAtom, submitConfirmationUnseenAtom, submitHashAtom } from "./atoms/transaction-flow.atoms";
import { DEPOSIT_RECEIPT_EVENT, saveDepositReceipt } from "./deposit-receipt";
import { useDepositReceiptRecovery } from "./use-deposit-receipt-recovery";
import { SUBMIT_CONFIRMATION_INITIAL_DELAY_MS } from "./constants";

vi.mock("@/lib/query/invalidation", () => ({ invalidateChainQueries: vi.fn(async () => {}) }));

const owner = { address: "account-a", network: 0, walletUnit: "11".repeat(28) + "01" };
const hash = "aa".repeat(32);
const clients: ReturnType<typeof createAppQueryClient>[] = [];
afterEach(() => {
  vi.useRealTimers();
  clients.splice(0).forEach(client => client.clear());
});

function setup() {
  vi.useFakeTimers();
  localStorage.clear();
  const store = createStore();
  const client = createAppQueryClient();
  clients.push(client);
  const fetch = vi.spyOn(client, "fetchQuery").mockResolvedValue({});
  store.set(queryClientAtom, client);
  store.set(activeWalletAtom, {} as BrowserWallet);
  store.set(activeWalletNameAtom, "lace");
  store.set(activeAddressAtom, owner.address);
  store.set(networkIdAtom, owner.network);
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams({ action: "lock-funds", wallet: owner.walletUnit })));
  saveDepositReceipt(owner, hash);
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  return { store, fetch, wrapper };
}

it("resumes retained receipt confirmation after the same wallet reconnects without duplicate polling", async () => {
  const { store, fetch, wrapper } = setup();
  renderHook(useDepositReceiptRecovery, { wrapper });
  expect(store.get(submitHashAtom)).toBe(hash);
  act(() => store.set(activeWalletAtom, {} as BrowserWallet));
  act(() => {
    window.dispatchEvent(new Event(DEPOSIT_RECEIPT_EVENT));
    window.dispatchEvent(new Event(DEPOSIT_RECEIPT_EVENT));
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS); });
  expect(fetch).toHaveBeenCalledOnce();
  expect(store.get(submitHashAtom)).toBe(hash);
  expect(store.get(submitConfirmedAtom)).toBe(true);
});

it("preserves a confirmed receipt when the same wallet reconnects", async () => {
  const { store, fetch, wrapper } = setup();
  store.set(submitHashAtom, hash);
  store.set(submitConfirmedAtom, true);
  renderHook(useDepositReceiptRecovery, { wrapper });
  act(() => store.set(activeWalletAtom, {} as BrowserWallet));
  await act(async () => { await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS); });
  expect(fetch).not.toHaveBeenCalled();
  expect(store.get(submitHashAtom)).toBe(hash);
  expect(store.get(submitConfirmedAtom)).toBe(true);
});

it("keeps another submitted hash when the same wallet reconnects", async () => {
  const { store, fetch, wrapper } = setup();
  const otherHash = "bb".repeat(32);
  store.set(submitHashAtom, otherHash);
  renderHook(useDepositReceiptRecovery, { wrapper });
  act(() => store.set(activeWalletAtom, {} as BrowserWallet));
  await act(async () => { await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS); });
  expect(fetch).not.toHaveBeenCalled();
  expect(store.get(submitHashAtom)).toBe(otherHash);
});

it("waits for an active submission to finish before resuming a retained receipt", async () => {
  const { store, fetch, wrapper } = setup();
  store.set(submitHashAtom, hash);
  store.set(submitConfirmationUnseenAtom, true);
  store.set(activeSubmitAtom, true);
  renderHook(useDepositReceiptRecovery, { wrapper });
  act(() => store.set(activeWalletAtom, {} as BrowserWallet));
  await act(async () => { await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS); });
  expect(fetch).not.toHaveBeenCalled();
  expect(store.get(submitConfirmationUnseenAtom)).toBe(true);
  act(() => store.set(activeSubmitAtom, false));
  await act(async () => { await vi.advanceTimersByTimeAsync(SUBMIT_CONFIRMATION_INITIAL_DELAY_MS); });
  expect(fetch).toHaveBeenCalledOnce();
  expect(store.get(submitConfirmedAtom)).toBe(true);
});
