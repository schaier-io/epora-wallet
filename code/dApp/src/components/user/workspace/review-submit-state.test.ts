import assert from "node:assert/strict";
import test from "node:test";
import { resolveReviewSubmitState } from "./review-submit-state";

const HASH = "ab".repeat(32);

test("nothing submitted: the button keeps its own meaning", () => {
  assert.deepEqual(resolveReviewSubmitState(null, "update-state", false), {
    repeatable: false,
    showsDone: false,
    awaitingAcknowledgement: false,
    doneLocked: false
  });
});

test("a one-shot action ends at a live Done that acknowledges the receipt", () => {
  for (const action of ["update-state", "wallet-withdraw", "wallet-vote", "wallet-publish"] as const) {
    const state = resolveReviewSubmitState(HASH, action, false);
    assert.equal(state.showsDone, true, action);
    assert.equal(state.awaitingAcknowledgement, true, action);
    assert.equal(state.doneLocked, false, action);
  }
});

test("mint keeps Done disabled so its overlay and submit guard stay in place", () => {
  assert.deepEqual(resolveReviewSubmitState(HASH, "mint", false), {
    repeatable: false,
    showsDone: true,
    awaitingAcknowledgement: false,
    doneLocked: true
  });
});

test("repeatable actions go straight back to their own label", () => {
  for (const action of ["use", "lock-funds", "distribute-beneficiaries"] as const) {
    const state = resolveReviewSubmitState(HASH, action, false);
    assert.equal(state.repeatable, true, action);
    assert.equal(state.showsDone, false, action);
  }
});

test("consolidate is repeatable only during beneficiary preparation", () => {
  assert.equal(resolveReviewSubmitState(HASH, "consolidate-utxo", true).repeatable, true);
  assert.equal(resolveReviewSubmitState(HASH, "consolidate-utxo", false).awaitingAcknowledgement, true);
});
