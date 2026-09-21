import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "jotai";
import { sttExtraTransfersAtom } from "./stt-spend-form.atoms";
import { transferRecipientModeAtom, transferCustomAddressAtom, transferDisplayAmountAtom, resetTransferFormAtom } from "./transfer-form.atoms";
import { routeStateAtom } from "../workspace-route.atoms";
import { validateTransferRows } from "../../helpers/validation";
import { computeActionSignature, type BuildActionSignatureCtx } from "../../workspace-action-signature";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import { EMPTY_CONTRACT_CONFIG } from "@/lib/types/contracts";

const recipient = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
function sendStore() {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "use" });
  store.set(transferRecipientModeAtom, "custom");
  store.set(transferCustomAddressAtom, recipient);
  store.set(transferDisplayAmountAtom, "1.5");
  return store;
}
function signature(store: ReturnType<typeof createStore>) {
  return computeActionSignature("use", {
    config: EMPTY_CONTRACT_CONFIG,
    sttStateForm: createDefaultStateForm(),
    sttExtraTransfers: store.get(sttExtraTransfersAtom),
    sttWalletInputs: [], sttWalletOutputs: [], sttOutputAssets: [],
  } as unknown as BuildActionSignatureCtx);
}

test("single send reaches transaction transfers without a staging click", () => {
  const store = sendStore();
  const transfers = store.get(sttExtraTransfersAtom);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].address, recipient);
  assert.deepEqual(transfers[0].amount, [{ unit: "lovelace", quantity: "1500000" }]);
  const errors = {};
  validateTransferRows(errors, "Transfers", transfers, 1);
  assert.deepEqual(errors, {});
});

test("recipient and amount edits invalidate the transaction signature", () => {
  const store = sendStore();
  const before = signature(store);
  store.set(transferDisplayAmountAtom, "2");
  const changedAmount = signature(store);
  assert.notEqual(changedAmount, before);
  store.set(transferCustomAddressAtom, "changed-recipient");
  assert.notEqual(signature(store), changedAmount);
});

test("batch includes staged recipients and current recipient exactly once", () => {
  const store = sendStore();
  const first = store.get(sttExtraTransfersAtom)[0];
  store.set(sttExtraTransfersAtom, current => [...current, first]);
  store.set(resetTransferFormAtom);
  assert.deepEqual(store.get(sttExtraTransfersAtom), [first]);
  store.set(transferRecipientModeAtom, "custom");
  store.set(transferCustomAddressAtom, recipient);
  store.set(transferDisplayAmountAtom, "3");
  assert.deepEqual(store.get(sttExtraTransfersAtom).map(row => row.amount[0].quantity), ["1500000", "3000000"]);
  store.set(sttExtraTransfersAtom, current => current.filter((_, index) => index !== 0));
  assert.equal(store.get(sttExtraTransfersAtom).length, 1);
});

test("invalid or partial current recipient blocks a batch instead of silently dropping it", () => {
  for (const amount of ["", "0", "-1", "abc", "1.0000001"]) {
    const store = sendStore();
    store.set(sttExtraTransfersAtom, store.get(sttExtraTransfersAtom));
    store.set(transferDisplayAmountAtom, amount);
    const transfers = store.get(sttExtraTransfersAtom);
    const errors = {};
    validateTransferRows(errors, "Transfers", transfers, 1);
    assert.equal(transfers.length, 2);
    assert.ok(Object.keys(errors).length > 0, `must reject ${JSON.stringify(amount)}`);
  }
});

test("live send form does not add transfers to other actions", () => {
  const store = sendStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "update-state" });
  assert.deepEqual(store.get(sttExtraTransfersAtom), []);
});
