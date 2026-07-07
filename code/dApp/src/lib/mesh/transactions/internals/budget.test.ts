import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyExecutionValidatorLabels } from "./budget";

// NOTE: budget.ts keeps its substantive logic (execution-unit extraction,
// manual budget override application, change-output rebalancing, fee recompute)
// in module-private functions that are only reachable through the async,
// network- and build-bound `buildTransactionWithReestimatedLimits`. The only
// exported pure function is `createEmptyExecutionValidatorLabels`, covered here.

test("createEmptyExecutionValidatorLabels returns fresh, empty label collections", () => {
  const labels = createEmptyExecutionValidatorLabels();
  assert.deepEqual(labels.mintValidators, []);
  assert.deepEqual(labels.rewardValidators, []);
  assert.ok(labels.spendValidatorsByRef instanceof Map);
  assert.equal(labels.spendValidatorsByRef.size, 0);
});

test("createEmptyExecutionValidatorLabels returns independent instances each call", () => {
  const first = createEmptyExecutionValidatorLabels();
  const second = createEmptyExecutionValidatorLabels();
  first.mintValidators.push("v1");
  first.spendValidatorsByRef.set("ref", "validator");
  // A second call must not observe mutations made to the first.
  assert.deepEqual(second.mintValidators, []);
  assert.equal(second.spendValidatorsByRef.size, 0);
  assert.notEqual(first.spendValidatorsByRef, second.spendValidatorsByRef);
});
