import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "jotai";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { recordRecoveryCapacityFailure } from "./recovery-capacity-model";
import { recoveryCapacityFailureAtom, recoveryCapacitySignatureAtom, currentRecoveryCapacityFailureAtom } from "./atoms/recovery-capacity.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { sttWalletInputsAtom, sttStateFormAtom } from "./atoms/forms/stt-spend-form.atoms";
import { lockedContractUtxosAtom } from "./atoms/workspace-data.atoms";
import { buildErrorWriteAtom, clearMessagesAtom, resetFlowAtom } from "./atoms/transaction-flow.atoms";
const SIZE = new Error("Serialized transaction uses 17000 bytes. The protocol limit is 16384.");
function fixture() {
  const store = createStore();
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=use-beneficiary")));
  const ref = { txHash: "aa".repeat(32), outputIndex: 0 };
  store.set(sttWalletInputsAtom, [ref]);
  store.set(lockedContractUtxosAtom, [{ input: ref, output: { address: "wallet", amount: [{ unit: "lovelace", quantity: "6000000" }] } }]);
  return store;
}
test("only actual beneficiary withdrawal capacity failures enable recovery", () => {
  for (const [action, error, expected] of [
    ["use-beneficiary", SIZE, "bytes"],
    ["use-beneficiary", new Error("Transaction uses 15000000 memory units. The protocol limit is 14000000."), "execution"],
    ["use", SIZE, null],
    ["use-beneficiary", new Error("Missing required signer"), null],
    ["use-beneficiary", new Error("Insufficient funds"), null],
    ["use-beneficiary", new Error("No wallet UTxO can cover script collateral"), null],
    ["use-beneficiary", new Error("Validator evaluation failed"), null]
  ] as const) {
    const store = fixture();
    recordRecoveryCapacityFailure(store, action, error, store.get(recoveryCapacitySignatureAtom));
    assert.equal(store.get(currentRecoveryCapacityFailureAtom)?.kind ?? null, expected);
  }
});
test("changed State, selected actual values, signer or wallet invalidates capacity recovery", () => {
  const changes = [
    (store: ReturnType<typeof createStore>) => store.set(sttStateFormAtom, { ...store.get(sttStateFormAtom), walletName: "Changed" }),
    (store: ReturnType<typeof createStore>) => store.set(activePaymentKeyHashAtom, "11".repeat(28)),
    (store: ReturnType<typeof createStore>) => store.set(sttWalletInputsAtom, []),
    (store: ReturnType<typeof createStore>) => store.set(lockedContractUtxosAtom, []),
    (store: ReturnType<typeof createStore>) => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "another-wallet" })
  ];
  for (const change of changes) {
    const store = fixture(); const signature = store.get(recoveryCapacitySignatureAtom);
    recordRecoveryCapacityFailure(store, "use-beneficiary", SIZE, signature);
    assert.ok(store.get(currentRecoveryCapacityFailureAtom));
    change(store);
    assert.equal(store.get(currentRecoveryCapacityFailureAtom), null);
    store.set(recoveryCapacityFailureAtom, null);
    recordRecoveryCapacityFailure(store, "use-beneficiary", SIZE, signature);
    assert.equal(store.get(recoveryCapacityFailureAtom), null);
  }
});
test("ordinary error writes, clear and wallet flow reset remove capacity recovery", () => {
  for (const clear of [
    (store: ReturnType<typeof createStore>) => store.set(buildErrorWriteAtom, { message: "Funding error" }),
    (store: ReturnType<typeof createStore>) => store.set(clearMessagesAtom),
    (store: ReturnType<typeof createStore>) => store.set(resetFlowAtom)
  ]) {
    const store = fixture();
    recordRecoveryCapacityFailure(store, "use-beneficiary", SIZE, store.get(recoveryCapacitySignatureAtom));
    clear(store);
    assert.equal(store.get(recoveryCapacityFailureAtom), null);
  }
});
