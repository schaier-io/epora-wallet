import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { usePayeeActionSession } from "./use-payee-action-session";

const wallet = vi.hoisted(() => ({ value: {
  activeWallet: {}, activeAddress: "address", activePaymentKeyHash: "hash", isDemoWallet: false, networkId: 0
} }));
vi.mock("@/providers/wallet-provider", () => ({ useWalletContext: () => wallet.value }));
beforeEach(() => {
  wallet.value = { activeWallet: {}, activeAddress: "address", activePaymentKeyHash: "hash", isDemoWallet: false, networkId: 0 };
});

it.each(["activeWallet", "activeAddress", "activePaymentKeyHash", "isDemoWallet", "networkId"] as const)(
  "retires the action and settles warning review when %s changes", async (field) => {
    const settleStop = vi.fn();
    const view = renderHook(() => usePayeeActionSession(settleStop));
    const originalSession = view.result.current.sessionRef.current;
    let answer!: Promise<boolean>;
    act(() => {
      answer = new Promise(resolve => { view.result.current.warningReviewRef.current = { resolve }; });
      view.result.current.setWarningReview(["Review fee"]);
    });
    switch (field) {
      case "activeWallet": wallet.value.activeWallet = {}; break;
      case "activeAddress": wallet.value.activeAddress = "other-address"; break;
      case "activePaymentKeyHash": wallet.value.activePaymentKeyHash = "other-hash"; break;
      case "isDemoWallet": wallet.value.isDemoWallet = true; break;
      case "networkId": wallet.value.networkId = 1; break;
    }
    view.rerender();
    await expect(answer).resolves.toBe(false);
    expect(view.result.current.sessionRef.current).not.toBe(originalSession);
    expect(view.result.current.warningReview).toBeNull();
    expect(settleStop).toHaveBeenCalledWith(false);
  }
);

it("settles warning review and invalidates the session on unmount", async () => {
  const view = renderHook(() => usePayeeActionSession(vi.fn()));
  const sessionRef = view.result.current.sessionRef;
  const answer = new Promise<boolean>(resolve => { view.result.current.warningReviewRef.current = { resolve }; });
  view.unmount();
  await expect(answer).resolves.toBe(false);
  expect(sessionRef.current).toBeNull();
});
