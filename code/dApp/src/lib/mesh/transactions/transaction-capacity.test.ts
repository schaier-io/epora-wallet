import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransactionCapacityFailure } from "../transaction-capacity";
import { createStageError } from "./internals/errors";
import { assertSerializedTransactionSizeIsBounded } from "./internals/budget";

test("capacity recognizes owned numeric byte and execution limits through real stage envelopes", () => {
  const bytes = new Error("Serialized transaction uses 17000 bytes. The protocol limit is 16384.");
  const wrapped = createStageError("submit:validate-transaction-bounds", bytes);
  assert.equal(classifyTransactionCapacityFailure(wrapped), "bytes");
  assert.equal(classifyTransactionCapacityFailure(JSON.parse(JSON.stringify({ error: { message: wrapped.message, cause: wrapped.cause } }))), "bytes");
  assert.equal(classifyTransactionCapacityFailure(new Error("Transaction uses 14000001 memory units. The protocol limit is 14000000.")), "execution");
  assert.equal(classifyTransactionCapacityFailure({ info: "Transaction uses 9000000001 CPU units. The protocol limit is 9000000000." }), "execution");
  assert.equal(classifyTransactionCapacityFailure(new Error("Transaction size exceeds the maximum allowed size.")), "bytes");
});
test("the actual serialized signed-size guard produces a classified capacity error", () => {
  let failure: unknown;
  try { assertSerializedTransactionSizeIsBounded("00".repeat(16385)); } catch (error) { failure = error; }
  assert.equal(classifyTransactionCapacityFailure(failure), "bytes");
});
test("capacity rejects funding, signer, stale input, rounding, generic evaluator and unknown input-count errors", () => {
  for (const message of ["Maximum Input Count Exceeded", "Not enough UTxOs to cover the required value.", "No wallet UTxO can cover script collateral.", "Missing required signer", "Input was already spent", "Asset cannot be split exactly", "Script evaluation failed", "Execution budget exhausted", "Cannot verify transaction CPU use because the protocol limit is missing.", "Serialized transaction uses 10 bytes. The protocol limit is 16384.", "Transaction uses 1 CPU units. The protocol limit is 0."]) {
    assert.equal(classifyTransactionCapacityFailure(new Error(message)), null, message);
  }
  assert.equal(classifyTransactionCapacityFailure({ details: { message: "Serialized transaction uses 17000 bytes. The protocol limit is 16384." } }), null);
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  assert.equal(classifyTransactionCapacityFailure(cycle), null);
});
