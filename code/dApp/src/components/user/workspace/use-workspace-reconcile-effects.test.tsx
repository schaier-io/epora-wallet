import { renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { type PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { streamingPaymentPayoutAmountsAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import {
  type WorkspaceReconcileEffectsCtx,
  useWorkspaceReconcileEffects
} from "@/components/user/workspace/use-workspace-reconcile-effects";
import {
  createDefaultStateForm,
  createDefaultStreamingPaymentFormState
} from "@/lib/contracts/state-form";
import { cloneStateForm } from "@/components/user/workspace/helpers";

describe("useWorkspaceReconcileEffects", () => {
  it("keeps payout defaults within the transaction cap after reconciliation", async () => {
    const store = createStore();
    const state = createDefaultStateForm();
    const configuredAmounts = ["1", "1", "0"];
    const streamingPaymentPayoutRows = configuredAmounts.map((configuredAmount, index) => ({
      streamingPayment: createDefaultStreamingPaymentFormState(String(index + 1)),
      dueAmount: "1",
      cleanupRequired: false,
      configuredAmount,
      unit: "lovelace"
    })) satisfies WorkspaceReconcileEffectsCtx["streamingPaymentPayoutRows"];
    const previousAutoMintStateRef = { current: cloneStateForm(state) };
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );

    renderHook(
      () =>
        useWorkspaceReconcileEffects({
          activeAddress: null,
          autoMintStateForm: state,
          availableLockedTransferAssets: [],
          previousAutoMintStateRef,
          streamingPaymentPayoutRows
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(store.get(streamingPaymentPayoutAmountsAtom)).toEqual({
        "1": "1",
        "2": "1",
        "3": "0"
      });
    });
  });
});
