import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { expect, it, vi } from "vitest";
import { createDefaultStreamingPaymentFormState, createDefaultStateForm, stateFormToDatum, withFallbackAdminUserInStateForm } from "@/lib/contracts/state-form";
import type * as PayoutAddress from "@/lib/contracts/payout-address";
import type { DetectedSttToken } from "@/lib/mesh/detection";
import { seedWorkspaceWalletAtom } from "./atoms/workspace-wallet-seeding.atoms";
import { reconcileWorkspaceWalletAtom, workspaceDraftConflictsAtom } from "./atoms/workspace-draft-revision.atoms";
import { streamingPaymentPayoutAmountsAtom, sttInputTxHashAtom, sttStateFormAtom, updateStateFormAtom } from "./atoms/forms/stt-spend-form.atoms";
import { transferCustomAddressAtom, transferDisplayAmountAtom } from "./atoms/forms/transfer-form.atoms";
import { allocatedLockedContractAssetsAtom } from "./atoms/workspace-transfer-derivations.atoms";
import { DEFAULT_OPTIONAL_CONSTR_PRESET } from "./constants";
import { sttExtraTransfersAtom } from "./atoms/forms/stt-spend-form.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { useWorkspaceDraftHandlers } from "./workspace-draft-handlers";

// These tests exercise draft reconciliation, not address serialization.
vi.mock("@/lib/contracts/payout-address", async (importOriginal) => ({
  ...await importOriginal<typeof PayoutAddress>(),
  describeAddressProblem: () => null,
  encodePayoutAddressToData: (address: string) => ({ alternative: 0, fields: [address] }),
  decodePayoutAddressFromData: (value: { fields: string[] }) => value.fields[0]
}));

const state = () => ({ ...withFallbackAdminUserInStateForm(createDefaultStateForm(), "cc".repeat(28)), walletName: "Family" });
function token(hash: string, form = state()): DetectedSttToken {
  return { unit: "aa".repeat(28) + "01", policyId: "aa".repeat(28), assetNameHex: "01", scriptAddress: "state",
    datum: stateFormToDatum(form), utxo: { input: { txHash: hash.repeat(64), outputIndex: 0 }, output: { address: "state", amount: [] } } };
}
function setup() {
  const store = createStore();
  const first = token("1");
  store.set(seedWorkspaceWalletAtom, first);
  return { store, first };
}

it("moves an external State input without losing the payout draft", () => {
  const { store } = setup();
  store.set(transferCustomAddressAtom, "recipient"); store.set(transferDisplayAmountAtom, "5");
  store.set(reconcileWorkspaceWalletAtom, token("2"));
  expect(store.get(sttInputTxHashAtom)).toBe("2".repeat(64));
  expect(store.get(transferCustomAddressAtom)).toBe("recipient");
  expect(store.get(transferDisplayAmountAtom)).toBe("5");
});
it("refreshes untouched rules and preserves an unrelated settings edit", () => {
  const { store } = setup();
  store.set(updateStateFormAtom, { ...store.get(updateStateFormAtom)!, walletName: "My draft name" });
  const latest = { ...state(), proofOfLifeIncrementMode: "some" as const, proofOfLifeIncrement: "1000" };
  store.set(reconcileWorkspaceWalletAtom, token("2", latest));
  expect(store.get(sttStateFormAtom).proofOfLifeIncrement).toBe("1000");
  expect(store.get(updateStateFormAtom)).toMatchObject({ walletName: "My draft name", proofOfLifeIncrement: "1000" });
  expect(store.get(workspaceDraftConflictsAtom)["update-state"]).toEqual([]);
});
it("keeps a conflicting edit blocked across later unrelated chain updates", () => {
  const { store } = setup();
  store.set(updateStateFormAtom, { ...store.get(updateStateFormAtom)!, walletName: "My draft name" });
  store.set(reconcileWorkspaceWalletAtom, token("2", { ...state(), walletName: "Other owner's name" }));
  store.set(reconcileWorkspaceWalletAtom, token("3", { ...state(), walletName: "Other owner's name", proofOfLifeIncrementMode: "some", proofOfLifeIncrement: "1000" }));
  expect(store.get(updateStateFormAtom)?.walletName).toBe("My draft name");
  expect(store.get(workspaceDraftConflictsAtom)["update-state"]).toContain("walletName");
});
function resetHook(store: ReturnType<typeof createStore>, selected = token("1")) {
  return renderHook(() => useWorkspaceDraftHandlers({ autoMintStateForm: state(), selectedDetectedToken: selected,
    clearBuildMessages: vi.fn(), clearPreviewResult: vi.fn(), pendingOrphanWalletInputsRef: { current: null } }),
  { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> });
}
it("reloading Send preserves changed People and wallet-name drafts", () => {
  const { store } = setup();
  store.set(updateStateFormAtom, { ...store.get(updateStateFormAtom)!, walletName: "Keep me", users: [] });
  store.set(transferDisplayAmountAtom, "5");
  const hook = resetHook(store);
  act(() => hook.result.current.resetActionDraft("use"));
  expect(store.get(updateStateFormAtom)).toMatchObject({ walletName: "Keep me", users: [] });
  expect(store.get(transferDisplayAmountAtom)).toBe("");
});
it("reloading People preserves another settings task and a payout", () => {
  const { store } = setup();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "update-state", selectedTask: "settings-people" });
  store.set(updateStateFormAtom, { ...store.get(updateStateFormAtom)!, walletName: "Keep me", users: [] });
  store.set(transferDisplayAmountAtom, "5");
  const hook = resetHook(store);
  act(() => hook.result.current.resetActionDraft("update-state"));
  expect(store.get(updateStateFormAtom)?.users).toHaveLength(1);
  expect(store.get(updateStateFormAtom)?.walletName).toBe("Keep me");
  expect(store.get(transferDisplayAmountAtom)).toBe("5");
});


it("reloading Send preserves a scheduled payout draft", () => {
  const { store } = setup();
  store.set(streamingPaymentPayoutAmountsAtom, { "4": "9" });
  const hook = resetHook(store);
  act(() => hook.result.current.resetActionDraft("use"));
  expect(store.get(streamingPaymentPayoutAmountsAtom)).toEqual({ "4": "9" });
});

it("reloading Add preserves an existing schedule edit and its chain conflict", () => {
  const { store } = setup();
  const existing = { ...createDefaultStreamingPaymentFormState("1"), payoutAddress: "chain payee" };
  const latest = token("2", { ...state(), streamingPayments: [existing] });
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "manage-streaming-payments", selectedTask: "streaming-payments-add" });
  store.set(sttStateFormAtom, { ...store.get(sttStateFormAtom), streamingPayments: [{ ...existing, id: "1", payoutAddress: "edited" }, createDefaultStreamingPaymentFormState("2")] });
  store.set(workspaceDraftConflictsAtom, { "manage-streaming-payments": ["streamingPayments"] });
  const hook = resetHook(store, latest);
  act(() => hook.result.current.resetActionDraft("manage-streaming-payments"));
  expect(store.get(sttStateFormAtom).streamingPayments).toHaveLength(1);
  expect(store.get(sttStateFormAtom).streamingPayments[0]?.payoutAddress).toBe("edited");
  expect(store.get(workspaceDraftConflictsAtom)["manage-streaming-payments"]).toContain("streamingPayments");
});


it.each(["7a", "-", "-3", ""])("keeps partial payout amount %s out of available-balance arithmetic", quantity => {
  const { store } = setup();
  store.set(sttExtraTransfersAtom, [{ address: "payee", amount: [{ unit: "lovelace", quantity }, { unit: "token", quantity: "4" }], inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET } }]);
  expect(store.get(allocatedLockedContractAssetsAtom)).toEqual([{ unit: "token", quantity: "4" }]);
});


it("reserves a valid pasted integer amount with surrounding whitespace", () => {
  const { store } = setup();
  store.set(sttExtraTransfersAtom, [{ address: "payee", amount: [{ unit: "token", quantity: " 4 " }], inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET } }]);
  expect(store.get(allocatedLockedContractAssetsAtom)).toEqual([{ unit: "token", quantity: "4" }]);
});
