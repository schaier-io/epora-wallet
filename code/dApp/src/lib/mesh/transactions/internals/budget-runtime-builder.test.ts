import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertRuntimeBuilderShape,
  type RuntimeTxBuilder
} from "@/lib/mesh/transactions/internals/budget-runtime-builder";

// The budget/fee logic reads and mutates undocumented Mesh SDK builder internals.
// assertRuntimeBuilderShape is the canary that fails loud on an SDK bump rather
// than silently corrupting fee rebalancing, so its accept/reject is pinned here.

test("assertRuntimeBuilderShape throws when a required SDK internal is missing", () => {
  assert.throws(
    () => assertRuntimeBuilderShape({ meshTxBuilderBody: {} } as unknown as RuntimeTxBuilder),
    /transaction-builder internals changed/
  );
});

test("assertRuntimeBuilderShape passes for a builder exposing the expected internals", () => {
  const builder = {
    meshTxBuilderBody: {},
    completeUnbalancedSync: () => "",
    calculateFee: () => 0n
  } as unknown as RuntimeTxBuilder;
  assert.doesNotThrow(() => assertRuntimeBuilderShape(builder));
});

test("assertRuntimeBuilderShape accepts getActualFee as the fee-calculator alternative", () => {
  const builder = {
    meshTxBuilderBody: {},
    completeUnbalancedSync: () => "",
    getActualFee: () => 0n
  } as unknown as RuntimeTxBuilder;
  assert.doesNotThrow(() => assertRuntimeBuilderShape(builder));
});
