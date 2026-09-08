import { act, render, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeBuildAtom, activeSubmitAtom } from "./atoms/transaction-flow.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import {
  beginWalletStateUpdateAtom,
  pendingWalletStateUpdateAtom
} from "./atoms/wallet-state-update.atoms";
import {
  type WorkspacePostSubmitEffectsCtx,
  useWorkspacePostSubmitEffects
} from "./use-workspace-post-submit-effects";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";
import type { StateFormState } from "@/lib/contracts/state-form";
import { createQueryTestWrapper } from "@/test/query-client";
import { queryKeys } from "@/lib/query/keys";

const WALLET_A = "addr_test_wallet_a";
const WALLET_B = "addr_test_wallet_b";

function Harness({ store }: { store: ReturnType<typeof createStore> }) {
  const postSubmitRefreshTimersRef = useRef<number[]>([]);
  const mintCelebrationRef = useRef<string | null>(null);
  const scheduledRef = useRef(false);

  useWorkspacePostSubmitEffects({
    mintCelebrationRef,
    mintConfirmation: null,
    mintStateForm: { walletName: "" } as StateFormState,
    mintedWalletName: "",
    postSubmitRefreshTimersRef,
    setMintCelebration: () => {}
  });

  useEffect(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    schedulePostSubmitRefresh({
      jotaiStore: store,
      postSubmitRefreshTimersRef
    });
  }, [store]);

  return null;
}

describe("useWorkspacePostSubmitEffects", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const clients: ReturnType<typeof createQueryTestWrapper>["queryClient"][] = [];
  afterEach(() => clients.splice(0).forEach(client => client.clear()));
  function renderHarness() {
    const { store, queryClient, wrapper } = createQueryTestWrapper();
    clients.push(queryClient);
    queryClient.setQueryData(queryKeys.addressUtxos(WALLET_A), []);
    const view = render(<Harness store={store} />, { wrapper });
    return { store, queryClient, ...view };
  }

  it("polls the wallet the transaction was submitted from", async () => {
    const { queryClient } = renderHarness();

    await vi.advanceTimersByTimeAsync(80_000);

    expect(queryClient.getQueryState(queryKeys.addressUtxos(WALLET_A))?.isInvalidated).toBe(true);
  });

  it("drops the pending poll when the workspace opens another wallet", async () => {
    const { store, queryClient } = renderHarness();

    act(() => {
      store.set(routeStateAtom, {
        ...store.get(routeStateAtom),
        selectedWalletUnit: WALLET_B
      });
    });
    await vi.advanceTimersByTimeAsync(80_000);

    expect(queryClient.getQueryState(queryKeys.addressUtxos(WALLET_A))?.isInvalidated).toBe(false);
  });

  it("clears the pending poll on unmount", async () => {
    const { unmount, queryClient } = renderHarness();

    unmount();
    await vi.advanceTimersByTimeAsync(80_000);

    expect(queryClient.getQueryState(queryKeys.addressUtxos(WALLET_A))?.isInvalidated).toBe(false);
  });

  it("retires pending work on wallet selection changes but preserves action navigation", () => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const ctx: WorkspacePostSubmitEffectsCtx = {
      mintCelebrationRef: { current: null },
      mintConfirmation: null,
      mintStateForm: { walletName: "Test" } as WorkspacePostSubmitEffectsCtx["mintStateForm"],
      mintedWalletName: "",
      postSubmitRefreshTimersRef: { current: [71] },
      setMintCelebration: vi.fn()
    };
    const hook = renderHook(() => useWorkspacePostSubmitEffects(ctx), { wrapper });
    try {
      act(() => {
        store.set(beginWalletStateUpdateAtom, {
          walletUnit: "policy01",
          submittedTxHash: "ab".repeat(32),
          spentRef: { txHash: "cd".repeat(32), outputIndex: 0 }
        });
        store.set(activeBuildAtom, "use");
        store.set(activeSubmitAtom, true);
        store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "mint" });
      });
      expect(clearTimeout).not.toHaveBeenCalledWith(71);
      expect(store.get(activeSubmitAtom)).toBe(true);
      expect(store.get(pendingWalletStateUpdateAtom)).not.toBeNull();
      act(() => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet-b" }));
      expect(clearTimeout).toHaveBeenCalledWith(71);
      expect(store.get(activeBuildAtom)).toBeNull();
      expect(store.get(activeSubmitAtom)).toBe(false);
      expect(store.get(pendingWalletStateUpdateAtom)).toBeNull();
    } finally {
      hook.unmount();
      clearTimeout.mockRestore();
    }
  });
});
