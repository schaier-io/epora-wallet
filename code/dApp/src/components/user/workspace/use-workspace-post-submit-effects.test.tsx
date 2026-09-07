import { act, render, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeBuildAtom, activeSubmitAtom } from "./atoms/transaction-flow.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import {
  type WorkspacePostSubmitEffectsCtx,
  useWorkspacePostSubmitEffects
} from "./use-workspace-post-submit-effects";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";
import type { StateFormState } from "@/lib/contracts/state-form";
import type { DetectedSttInfo } from "@/lib/mesh/detection";

const EMPTY_DETECTION: DetectedSttInfo = {
  policyId: "",
  assetNameHex: "",
  scriptAddress: "",
  sttUtxos: [],
  tokens: []
};

const WALLET_A = "addr_test_wallet_a";
const WALLET_B = "addr_test_wallet_b";

function createRefreshSpies() {
  return {
    refreshLockedContractUtxos: vi.fn(() => Promise.resolve()),
    refreshWalletBalance: vi.fn(() => Promise.resolve()),
    refreshPermissionWalletSummaries: vi.fn(() => Promise.resolve()),
    refreshDetectedTokens: vi.fn(() => Promise.resolve(EMPTY_DETECTION))
  };
}

type RefreshSpies = ReturnType<typeof createRefreshSpies>;

function Harness({
  lockingContractAddress,
  spies,
  store
}: {
  lockingContractAddress: string;
  spies: RefreshSpies;
  store: ReturnType<typeof createStore>;
}) {
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
      postSubmitRefreshTimersRef,
      lockingContract: { address: lockingContractAddress, error: null },
      ...spies
    });
  }, [lockingContractAddress, spies, store]);

  return null;
}

describe("useWorkspacePostSubmitEffects", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderHarness(spies: RefreshSpies) {
    const store = createStore();
    const view = render(
      <Provider store={store}>
        <Harness lockingContractAddress={WALLET_A} spies={spies} store={store} />
      </Provider>
    );
    return { store, ...view };
  }

  it("polls the wallet the transaction was submitted from", async () => {
    const spies = createRefreshSpies();
    renderHarness(spies);

    await vi.advanceTimersByTimeAsync(80_000);

    expect(spies.refreshLockedContractUtxos).toHaveBeenCalledWith(WALLET_A);
  });

  it("drops the pending poll when the workspace opens another wallet", async () => {
    const spies = createRefreshSpies();
    const { store } = renderHarness(spies);

    act(() => {
      store.set(routeStateAtom, {
        ...store.get(routeStateAtom),
        selectedWalletUnit: WALLET_B
      });
    });
    await vi.advanceTimersByTimeAsync(80_000);

    expect(spies.refreshLockedContractUtxos).not.toHaveBeenCalledWith(WALLET_A);
  });

  it("clears the pending poll on unmount", async () => {
    const spies = createRefreshSpies();
    const { unmount } = renderHarness(spies);

    unmount();
    await vi.advanceTimersByTimeAsync(80_000);

    expect(spies.refreshLockedContractUtxos).not.toHaveBeenCalled();
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
        store.set(activeBuildAtom, "use");
        store.set(activeSubmitAtom, true);
        store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "mint" });
      });
      expect(clearTimeout).not.toHaveBeenCalledWith(71);
      expect(store.get(activeSubmitAtom)).toBe(true);
      act(() => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet-b" }));
      expect(clearTimeout).toHaveBeenCalledWith(71);
      expect(store.get(activeBuildAtom)).toBeNull();
      expect(store.get(activeSubmitAtom)).toBe(false);
    } finally {
      hook.unmount();
      clearTimeout.mockRestore();
    }
  });
});
