import { renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { type PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { streamingPaymentPayoutAmountsAtom, sttExtraTransfersAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { transferSelectedUnitAtom, transferDisplayAmountAtom, transferCustomAddressAtom, transferRecipientModeAtom } from "./atoms/forms/transfer-form.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
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
  it.each([true, false])("does not reuse a disappeared token amount for the fallback asset (ADA: %s)", fallbackIsAda => {
    const store = createStore();
    const token = "aa".repeat(28) + "01";
    const fallback = fallbackIsAda ? "lovelace" : "bb".repeat(28) + "02";
    store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "use" });
    store.set(transferSelectedUnitAtom, token);
    store.set(transferDisplayAmountAtom, "2");
    store.set(transferRecipientModeAtom, "custom");
    store.set(transferCustomAddressAtom, "recipient");
    const state = createDefaultStateForm();
    const props: WorkspaceReconcileEffectsCtx = { activeAddress: null, autoMintStateForm: state,
      availableLockedTransferAssets: [{ unit: fallback, quantity: "10000000" }, { unit: token, quantity: "5" }],
      previousAutoMintStateRef: { current: state }, streamingPaymentPayoutRows: [] };
    const view = renderHook(useWorkspaceReconcileEffects, { initialProps: props,
      wrapper: ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider> });
    expect(store.get(sttExtraTransfersAtom)[0]!.amount).toEqual([{ unit: token, quantity: "2" }]);
    view.rerender({ ...props, availableLockedTransferAssets: [{ unit: fallback, quantity: "10000000" }] });
    expect(store.get(transferSelectedUnitAtom)).toBe(fallback);
    expect(store.get(transferDisplayAmountAtom)).toBe("");
    expect(store.get(transferCustomAddressAtom)).toBe("recipient");
    expect(store.get(sttExtraTransfersAtom)[0]!.amount).toEqual([{ unit: fallback, quantity: "" }]);
  });

  it("keeps every payout default after reconciliation", async () => {
    const store = createStore();
    const state = createDefaultStateForm();
    const configuredAmounts = ["1", "1", "1"];
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
        "3": "1"
      });
    });
  });

  // A payout that lands after first render (the payee collects) lowers the due amount.
  // The kept amount must follow it down, or validation blocks with "exceeds due".
  it("clamps a kept payout amount when its due amount drops below it", async () => {
    const store = createStore();
    const state = createDefaultStateForm();
    const row = (dueAmount: string, configuredAmount: string) => ({
      streamingPayment: createDefaultStreamingPaymentFormState("1"),
      dueAmount,
      cleanupRequired: false,
      configuredAmount,
      unit: "lovelace"
    });
    const props: WorkspaceReconcileEffectsCtx = { activeAddress: null, autoMintStateForm: state,
      availableLockedTransferAssets: [], previousAutoMintStateRef: { current: cloneStateForm(state) },
      streamingPaymentPayoutRows: [row("5000000", "5000000")] };
    const view = renderHook(useWorkspaceReconcileEffects, { initialProps: props,
      wrapper: ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider> });
    await waitFor(() => expect(store.get(streamingPaymentPayoutAmountsAtom)).toEqual({ "1": "5000000" }));

    view.rerender({ ...props, streamingPaymentPayoutRows: [row("2000000", "5000000")] });
    await waitFor(() => expect(store.get(streamingPaymentPayoutAmountsAtom)).toEqual({ "1": "2000000" }));

    // An amount the reader lowered below the due amount stays theirs.
    store.set(streamingPaymentPayoutAmountsAtom, { "1": "1000000" });
    view.rerender({ ...props, streamingPaymentPayoutRows: [row("1500000", "1000000")] });
    await waitFor(() => expect(store.get(streamingPaymentPayoutAmountsAtom)).toEqual({ "1": "1000000" }));
  });
});
