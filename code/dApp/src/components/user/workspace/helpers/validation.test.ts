import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NON_NEGATIVE_INTEGER_SCHEMA,
  OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
  REQUIRED_TEXT_SCHEMA,
  appendValidationErrors,
  countFieldErrorMessages,
  getFirstFieldError,
  hasFieldErrors,
  hasPositiveAssetAmount,
  pushFieldError,
  validateAssetRows,
  validateField,
  validateTransferRows,
  validateWalletInputRefs,
  validateWalletScriptOutputs
} from "./validation";
import { type FieldErrors } from "@/components/user/flow-types";
import { type Asset, type WalletInputRef } from "@/lib/types/contracts";
import {
  type TransferFormState,
  type WalletScriptOutputFormState
} from "@/components/user/workspace/types";

test("NON_NEGATIVE_INTEGER_SCHEMA accepts whole numbers and rejects the rest", () => {
  assert.equal(NON_NEGATIVE_INTEGER_SCHEMA.safeParse("42").success, true);
  assert.equal(NON_NEGATIVE_INTEGER_SCHEMA.safeParse("  7 ").success, true); // trimmed
  assert.equal(NON_NEGATIVE_INTEGER_SCHEMA.safeParse("1.5").success, false);
  assert.equal(NON_NEGATIVE_INTEGER_SCHEMA.safeParse("-1").success, false);
  assert.equal(NON_NEGATIVE_INTEGER_SCHEMA.safeParse("").success, false);
  assert.equal(NON_NEGATIVE_INTEGER_SCHEMA.safeParse("abc").success, false);
});

test("OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA allows empty but not malformed", () => {
  assert.equal(OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA.safeParse("").success, true);
  assert.equal(OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA.safeParse("   ").success, true);
  assert.equal(OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA.safeParse("5").success, true);
  assert.equal(OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA.safeParse("x").success, false);
});

test("REQUIRED_TEXT_SCHEMA requires non-whitespace content", () => {
  assert.equal(REQUIRED_TEXT_SCHEMA.safeParse("hi").success, true);
  assert.equal(REQUIRED_TEXT_SCHEMA.safeParse("   ").success, false);
});

test("pushFieldError creates the bucket and appends without clobbering", () => {
  const errors: FieldErrors = {};
  pushFieldError(errors, "amount", "first");
  pushFieldError(errors, "amount", "second");
  assert.deepEqual(errors, { amount: ["first", "second"] });
});

test("hasFieldErrors / countFieldErrorMessages / getFirstFieldError reflect state", () => {
  const errors: FieldErrors = {};
  assert.equal(hasFieldErrors(errors), false);
  assert.equal(countFieldErrorMessages(errors), 0);
  assert.equal(getFirstFieldError(errors, "amount"), null);

  pushFieldError(errors, "amount", "one");
  pushFieldError(errors, "amount", "two");
  pushFieldError(errors, "address", "bad");

  assert.equal(hasFieldErrors(errors), true);
  assert.equal(countFieldErrorMessages(errors), 3);
  assert.equal(getFirstFieldError(errors, "amount"), "one");
  assert.equal(getFirstFieldError(errors, "missing"), null);
});

test("validateField records the schema issue under the target key", () => {
  const errors: FieldErrors = {};
  validateField(errors, "amount", NON_NEGATIVE_INTEGER_SCHEMA, "-1");
  assert.equal(errors.amount?.length, 1);
  assert.match(errors.amount![0]!, /whole number/);
  // form key must not leak
  assert.equal(errors.form, undefined);
});

test("validateField does nothing when the value is valid", () => {
  const errors: FieldErrors = {};
  validateField(errors, "amount", NON_NEGATIVE_INTEGER_SCHEMA, "3");
  assert.deepEqual(errors, {});
});

test("validateAssetRows skips fully-empty rows and flags partial rows", () => {
  const errors: FieldErrors = {};
  const assets: Asset[] = [
    { unit: "", quantity: "" }, // fully empty -> ignored
    { unit: "lovelace", quantity: "" }, // partial -> flagged
    { unit: "", quantity: "5" } // partial -> flagged
  ];
  validateAssetRows(errors, "amount", assets);
  assert.equal(errors.amount?.length, 2);
  assert.match(errors.amount![0]!, /Complete asset row 2/);
  assert.match(errors.amount![1]!, /Complete asset row 3/);
});

test("validateAssetRows validates quantity of complete rows", () => {
  const errors: FieldErrors = {};
  validateAssetRows(errors, "amount", [{ unit: "lovelace", quantity: "-4" }]);
  assert.equal(errors.amount?.length, 1);
  assert.match(errors.amount![0]!, /whole number/);
});

test("hasPositiveAssetAmount requires a unit and a positive integer quantity", () => {
  assert.equal(hasPositiveAssetAmount([{ unit: "lovelace", quantity: "1" }]), true);
  assert.equal(hasPositiveAssetAmount([{ unit: "lovelace", quantity: "0" }]), false);
  assert.equal(hasPositiveAssetAmount([{ unit: "", quantity: "5" }]), false);
  assert.equal(hasPositiveAssetAmount([{ unit: "lovelace", quantity: "-3" }]), false);
  assert.equal(hasPositiveAssetAmount([{ unit: "lovelace", quantity: "1.5" }]), false);
  assert.equal(hasPositiveAssetAmount([]), false);
});

test("validateWalletInputRefs enforces a minimum count with correct singular/plural", () => {
  const single: FieldErrors = {};
  validateWalletInputRefs(single, "inputs", [], 1);
  assert.match(single.inputs![0]!, /at least one wallet input/);

  const many: FieldErrors = {};
  validateWalletInputRefs(many, "inputs", [], 2);
  assert.match(many.inputs![0]!, /at least 2 wallet inputs/);
});

test("validateWalletInputRefs flags blank tx hashes and invalid output indexes", () => {
  const errors: FieldErrors = {};
  const refs: WalletInputRef[] = [
    { txHash: "", outputIndex: 0 },
    { txHash: "aa", outputIndex: -1 },
    { txHash: "bb", outputIndex: 1.5 }
  ];
  validateWalletInputRefs(errors, "inputs", refs);
  // ref1: missing hash; ref2: invalid index; ref3: invalid index
  assert.equal(errors.inputs?.length, 3);
  assert.match(errors.inputs![0]!, /Wallet input 1 is missing a tx hash/);
  assert.match(errors.inputs![1]!, /Wallet input 2 needs a valid output index/);
  assert.match(errors.inputs![2]!, /Wallet input 3 needs a valid output index/);
});

test("validateWalletInputRefs passes clean refs with no minimum", () => {
  const errors: FieldErrors = {};
  validateWalletInputRefs(errors, "inputs", [{ txHash: "aa", outputIndex: 0 }]);
  assert.deepEqual(errors, {});
});

test("validateTransferRows flags missing addresses and delegates to asset validation", () => {
  const errors: FieldErrors = {};
  const transfers = [
    { address: "", amount: [{ unit: "lovelace", quantity: "1" }] },
    { address: "addr1", amount: [{ unit: "lovelace", quantity: "-1" }] }
  ] as TransferFormState[];
  validateTransferRows(errors, "transfers", transfers);
  assert.equal(errors.transfers?.length, 2);
  assert.match(errors.transfers![0]!, /Transfer 1 is missing a destination address/);
  assert.match(errors.transfers![1]!, /whole number/);
});

test("validateWalletScriptOutputs validates each output's asset rows", () => {
  const errors: FieldErrors = {};
  const outputs = [
    { amount: [{ unit: "lovelace", quantity: "bad" }] }
  ] as WalletScriptOutputFormState[];
  validateWalletScriptOutputs(errors, "outputs", outputs);
  assert.equal(errors.outputs?.length, 1);
  assert.match(errors.outputs![0]!, /whole number/);
});

test("appendValidationErrors pushes each message under the key", () => {
  const errors: FieldErrors = {};
  appendValidationErrors(errors, "form", ["a", "b"]);
  assert.deepEqual(errors.form, ["a", "b"]);
  assert.equal(countFieldErrorMessages(errors), 2);
});
