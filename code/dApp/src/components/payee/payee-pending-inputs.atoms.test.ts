import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "jotai";
import {
  beginPayeeInputActionAtom,
  markPayeeInputSubmittedAtom,
  payeePendingInputKey,
  pendingPayeeInputActionsAtom,
  reconcilePayeeInputsAtom,
  releasePayeeInputActionAtom
} from "./payee-pending-inputs.atoms";

const DETAILS = {
  policyId: "aa".repeat(28),
  stateInput: `${"11".repeat(32)}#0`,
  streamKey: "stream-1",
  action: "collect" as const
};
const KEY = payeePendingInputKey(DETAILS.policyId, DETAILS.stateInput);

test("reserves an input across actions and sibling streams, independently for each policy", () => {
  const store = createStore();
  assert.equal(store.set(beginPayeeInputActionAtom, DETAILS), true);
  assert.equal(store.set(beginPayeeInputActionAtom, {
    ...DETAILS, action: "shorten", streamKey: "stream-2"
  }), false);
  assert.equal(store.set(beginPayeeInputActionAtom, {
    ...DETAILS, policyId: "bb".repeat(28)
  }), true);
});

test("a scan cannot release an input while its transaction is still building or signing", () => {
  const store = createStore();
  store.set(beginPayeeInputActionAtom, DETAILS);
  store.set(reconcilePayeeInputsAtom, { policyId: DETAILS.policyId, inputKeys: new Set<string>() });
  assert.equal(store.get(pendingPayeeInputActionsAtom)[KEY]?.phase, "building");
});

test("reconciles submitted inputs only against the scanned policy", () => {
  const store = createStore();
  store.set(beginPayeeInputActionAtom, DETAILS);
  store.set(markPayeeInputSubmittedAtom, { key: KEY, txHash: "submitted-tx" });
  store.set(reconcilePayeeInputsAtom, { policyId: "bb".repeat(28), inputKeys: new Set<string>() });
  assert.equal(store.get(pendingPayeeInputActionsAtom)[KEY]?.phase, "submitted");
  store.set(reconcilePayeeInputsAtom, {
    policyId: DETAILS.policyId, inputKeys: new Set([DETAILS.stateInput])
  });
  assert.equal(store.get(pendingPayeeInputActionsAtom)[KEY]?.phase, "submitted");
  store.set(reconcilePayeeInputsAtom, { policyId: DETAILS.policyId, inputKeys: new Set<string>() });
  assert.deepEqual(store.get(pendingPayeeInputActionsAtom), {});
});

test("a failed action releases its reservation so the same input can be retried", () => {
  const store = createStore();
  store.set(beginPayeeInputActionAtom, DETAILS);
  store.set(releasePayeeInputActionAtom, KEY);
  assert.equal(store.set(beginPayeeInputActionAtom, DETAILS), true);
});
