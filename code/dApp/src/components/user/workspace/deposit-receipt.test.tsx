import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { activeAddressAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { activeSubmitAtom, submitHashAtom, submittedActionAtom } from "./atoms/transaction-flow.atoms";
import { acknowledgeDepositReceipt, depositReceiptKey, readDepositReceipt, saveDepositReceipt } from "./deposit-receipt";
import { useDepositReceiptRecovery } from "./use-deposit-receipt-recovery";
import { watchTransactionConfirmation } from "./watch-transaction-confirmation";

vi.mock("./watch-transaction-confirmation", () => ({ watchTransactionConfirmation: vi.fn(async () => {}) }));
const owner = { address: "account-a", network: 0, walletUnit: "11".repeat(28) + "01" };
const hash = "aa".repeat(32);
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

function setup(options: Partial<typeof owner> = {}, action = "lock-funds") {
  const scope = { ...owner, ...options };
  const store = createStore();
  store.set(activeAddressAtom, scope.address);
  store.set(networkIdAtom, scope.network);
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams({ action, wallet: scope.walletUnit })));
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  return { store, wrapper };
}

it("restores an accepted deposit after a new page mount and resumes confirmation", () => {
  saveDepositReceipt(owner, hash);
  const { store, wrapper } = setup();
  renderHook(useDepositReceiptRecovery, { wrapper });
  expect(store.get(submitHashAtom)).toBe(hash);
  expect(store.get(submittedActionAtom)).toBe("lock-funds");
  expect(watchTransactionConfirmation).toHaveBeenCalledWith(store, hash, "lock-funds");
});

it.each([{ address: "account-b" }, { network: 1 }, { walletUnit: "22".repeat(28) + "01" }])("isolates restored receipts by owner (%j)", options => {
  saveDepositReceipt(owner, hash);
  const { store, wrapper } = setup(options);
  renderHook(useDepositReceiptRecovery, { wrapper });
  expect(store.get(submitHashAtom)).toBeNull();
  expect(watchTransactionConfirmation).not.toHaveBeenCalled();
});

it("does not restore deposits into Send or replace an active submission", () => {
  saveDepositReceipt(owner, hash);
  const send = setup({}, "use");
  renderHook(useDepositReceiptRecovery, { wrapper: send.wrapper });
  expect(send.store.get(submitHashAtom)).toBeNull();
  const receive = setup();
  receive.store.set(activeSubmitAtom, true);
  renderHook(useDepositReceiptRecovery, { wrapper: receive.wrapper });
  expect(receive.store.get(submitHashAtom)).toBeNull();
});

it("restores a late accepted broadcast when the user has already returned", () => {
  const { store, wrapper } = setup();
  renderHook(useDepositReceiptRecovery, { wrapper });
  act(() => saveDepositReceipt(owner, hash));
  expect(store.get(submitHashAtom)).toBe(hash);
});

it("restores a late receipt when an active submission finishes", () => {
  const { store, wrapper } = setup();
  store.set(activeSubmitAtom, true);
  renderHook(useDepositReceiptRecovery, { wrapper });
  act(() => saveDepositReceipt(owner, hash));
  expect(store.get(submitHashAtom)).toBeNull();
  act(() => store.set(activeSubmitAtom, false));
  expect(store.get(submitHashAtom)).toBe(hash);
});

it("acknowledges only the shown hash and keeps newer accepted receipts", () => {
  saveDepositReceipt(owner, hash);
  const next = "bb".repeat(32);
  saveDepositReceipt(owner, next);
  acknowledgeDepositReceipt(owner, hash);
  expect(readDepositReceipt(owner)?.txHash).toBe(next);
  acknowledgeDepositReceipt(owner, next);
  expect(readDepositReceipt(owner)).toBeNull();
});

it("rejects malformed stored data and stores no signing material", () => {
  localStorage.setItem(depositReceiptKey(owner), JSON.stringify({ txHash: "invalid", submittedAt: 0 }));
  expect(readDepositReceipt(owner)).toBeNull();
  saveDepositReceipt(owner, hash);
  const stored = JSON.parse(localStorage.getItem(depositReceiptKey(owner))!) as Record<string, unknown>;
  expect(Object.keys(stored).sort()).toEqual(["submittedAt", "txHash"]);
});

it("ignores unrelated storage events but restores a matching receipt event", () => {
  const { store, wrapper } = setup();
  renderHook(useDepositReceiptRecovery, { wrapper });
  localStorage.setItem(depositReceiptKey(owner), JSON.stringify({ txHash: hash, submittedAt: 0 }));
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "other-key", storageArea: localStorage })));
  expect(store.get(submitHashAtom)).toBeNull();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: depositReceiptKey(owner), storageArea: sessionStorage })));
  expect(store.get(submitHashAtom)).toBeNull();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: depositReceiptKey(owner), storageArea: localStorage })));
  expect(store.get(submitHashAtom)).toBe(hash);
});
