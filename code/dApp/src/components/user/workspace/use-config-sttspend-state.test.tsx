import { act, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { describe, expect, it, vi } from "vitest";

import { activeSubmitAtom, submitHashAtom } from "./atoms/transaction-flow.atoms";
import { transferCustomAddressAtom, transferDisplayAmountAtom, transferRecipientModeAtom } from "./atoms/forms/transfer-form.atoms";
import { stagedSttTransfersAtom, sttExtraTransfersAtom } from "./atoms/forms/stt-spend-form.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { maximumAllowanceTransfer } from "@/lib/contracts/use-allowance";
import { createDefaultStateForm, createDefaultUserFormState, stateFormToDatum } from "@/lib/contracts/state-form";
import { serializeTransfers } from "./helpers/serialize";
import { WorkspaceActionsProvider } from "./workspace-actions-context";
import { useConfigSttSpendState } from "./use-config-sttspend-state";

/**
 * The submitted-transaction receipt used to sit over the form for good: after a
 * send confirmed, editing the recipient or amount staged a NEW transaction while
 * the rail kept showing the old one's "Transaction confirmed" banner, because
 * only navigation and the manual reset buttons retired it.
 *
 * The retirement is a signature watcher in `useConfigSttSpendState`, not wrapped
 * setters: a wrapper's fresh closure per render made the auto-apply authority
 * effect re-fire every render and dismiss the receipt at submit time, and the
 * staging buttons write through `useSetAtom` and bypass any wrapper. The
 * watcher re-baselines whenever the hash changes, so the post-submit draft
 * resets never read as edits, and it is gated on `!activeSubmit` so an edit
 * while a tx is confirming leaves the banner alone.
 *
 * Blind spot: these tests prove the wiring against a stubbed workspace context.
 * They do not re-render the real review rail, so the banner's disappearance
 * rests on the existing review-panel tests (banner renders only while
 * `submitHash` is set) plus `dismissSubmitState`'s own atom writes.
 */

function renderState(
  context: Record<string, unknown>,
  store: ReturnType<typeof createStore>
) {
  let latest: ReturnType<typeof useConfigSttSpendState>;
  function Probe() {
    latest = useConfigSttSpendState();
    return null;
  }
  render(
    <Provider store={store}>
      <WorkspaceActionsProvider value={context as never}>
        <Probe />
      </WorkspaceActionsProvider>
    </Provider>
  );
  return () => latest;
}

const BASE_CONTEXT = {
  activeFieldErrors: {},
  addSimpleTransferRecipient: vi.fn(),
  flowAvailability: null,
  guidedStreamingPaymentTaskBadges: [],
  guidedStreamingPaymentsDisabledTasks: [],
  handleFocusedTaskSelect: vi.fn(),
  openWorkspaceIntent: vi.fn()
};

describe("useConfigSttSpendState submit receipt retirement", () => {
  it("retires the submitted receipt when the draft changes", () => {
    const store = createStore();
    store.set(submitHashAtom, "abc123");
    const dismissSubmitState = vi.fn(() => store.set(submitHashAtom, null));
    const get = renderState({ ...BASE_CONTEXT, dismissSubmitState }, store);

    act(() => {
      get().setTransferDisplayAmount("14");
    });
    expect(dismissSubmitState).toHaveBeenCalledTimes(1);
  });

  it("leaves the rail alone while nothing is submitted", () => {
    const store = createStore();
    const dismissSubmitState = vi.fn();
    const get = renderState({ ...BASE_CONTEXT, dismissSubmitState }, store);

    act(() => {
      get().setTransferDisplayAmount("14");
      get().setTransferRecipientMode("my-address");
    });
    expect(dismissSubmitState).not.toHaveBeenCalled();
  });

  it("does not retire while a submit is in flight", () => {
    const store = createStore();
    store.set(submitHashAtom, "abc123");
    store.set(activeSubmitAtom, true);
    const dismissSubmitState = vi.fn();
    const get = renderState({ ...BASE_CONTEXT, dismissSubmitState }, store);

    act(() => {
      get().setTransferDisplayAmount("14");
    });
    expect(dismissSubmitState).not.toHaveBeenCalled();
  });

  it("re-baselines when the hash clears, so the next edit starts fresh", () => {
    const store = createStore();
    store.set(submitHashAtom, "abc123");
    const dismissSubmitState = vi.fn(() => store.set(submitHashAtom, null));
    const get = renderState({ ...BASE_CONTEXT, dismissSubmitState }, store);

    act(() => {
      get().setTransferDisplayAmount("14");
    });
    expect(dismissSubmitState).toHaveBeenCalledTimes(1);
    expect(store.get(transferDisplayAmountAtom)).toBe("14");
    // The dismissal cleared the hash and the post-submit form reset changed the
    // draft; the baseline re-armed, so a later edit needs no second dismissal.
    act(() => {
      get().setTransferDisplayAmount("15");
    });
    expect(dismissSubmitState).toHaveBeenCalledTimes(1);
    expect(store.get(transferDisplayAmountAtom)).toBe("15");
  });

  it("does not retire when a programmatic write changes nothing", () => {
    const store = createStore();
    store.set(submitHashAtom, "abc123");
    const dismissSubmitState = vi.fn();
    const get = renderState({ ...BASE_CONTEXT, dismissSubmitState }, store);

    // The auto-apply authority effect writes the already-set value.
    act(() => {
      get().setSttAuthorityPath("admin");
    });
    expect(dismissSubmitState).not.toHaveBeenCalled();
  });
});


it("keeps allowance Max available for an empty live amount and reserves only staged payouts", () => {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "use-allowance" });
  store.set(transferRecipientModeAtom, "custom");
  store.set(transferCustomAddressAtom, "addr_test1_live");
  store.set(transferDisplayAmountAtom, "");
  store.set(stagedSttTransfersAtom, [{ address: "addr_test1_staged", amount: [{ unit: "lovelace", quantity: "1000000" }], inlineDatum: { mode: "none", customAlternative: "" } }]);
  const get = renderState(BASE_CONTEXT, store);
  // Transaction validation must retain the incomplete row. The Max input must exclude it.
  expect(store.get(sttExtraTransfersAtom)).toHaveLength(2);
  expect(store.get(sttExtraTransfersAtom)[1].amount[0].quantity).toBe("");
  const form = createDefaultStateForm();
  const signer = "ab".repeat(28);
  const user = createDefaultUserFormState("0");
  user.wallets = [signer];
  user.perDayAllowance = [{ policyId: "", assetName: "", amount: "5" }];
  user.remainingAllowance = [{ policyId: "", assetName: "", amount: "3" }];
  user.nextAllowanceReset = "200000000";
  form.users = [user];
  const maximum = () => maximumAllowanceTransfer({ stateDatum: stateFormToDatum(form), allowanceSignerKeyHash: signer, unit: "lovelace", balance: "9000000", stagedTransfers: serializeTransfers(get().sttExtraTransfers), txEarliestTimeMs: 1000000, txLatestTimeMs: 1100000 });
  expect(maximum()).toBe("2000000");
  act(() => { get().setTransferDisplayAmount("1"); });
  expect(maximum()).toBe("2000000");
});
