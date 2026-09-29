import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
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

describe("useWorkspacePostSubmitEffects", () => {
  it("retires pending work on wallet selection changes but preserves action navigation", () => {
    const store = createStore();
    store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "policy01" });
    const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
    const ctx: WorkspacePostSubmitEffectsCtx = {
      mintCelebrationRef: { current: null },
      mintConfirmation: null,
      mintStateForm: { walletName: "Test" } as WorkspacePostSubmitEffectsCtx["mintStateForm"],
      mintedWalletName: "",
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
      expect(store.get(activeSubmitAtom)).toBe(true);
      expect(store.get(pendingWalletStateUpdateAtom)).not.toBeNull();
      act(() => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet-b" }));
      expect(store.get(activeBuildAtom)).toBeNull();
      expect(store.get(activeSubmitAtom)).toBe(false);
      expect(store.get(pendingWalletStateUpdateAtom)).toBeNull();
    } finally {
      hook.unmount();
    }
  });
});
