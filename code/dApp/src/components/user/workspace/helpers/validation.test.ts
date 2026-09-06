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
import { FIELD_ERROR_KEYS } from "@/components/user/field-error-keys";
import { type FieldErrors } from "@/components/user/flow-types";
import { type Asset, type WalletInputRef } from "@/lib/types/contracts";
import {
  type TransferFormState,
  type WalletScriptOutputFormState
} from "@/components/user/workspace/types";

// A real preprod base address (payment + stake credential), network id 0.
const VALID_PREPROD_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

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
  pushFieldError(errors, FIELD_ERROR_KEYS.withdrawalAmount, "first");
  pushFieldError(errors, FIELD_ERROR_KEYS.withdrawalAmount, "second");
  assert.deepEqual(errors, { [FIELD_ERROR_KEYS.withdrawalAmount]: ["first", "second"] });
});

test("hasFieldErrors / countFieldErrorMessages / getFirstFieldError reflect state", () => {
  const errors: FieldErrors = {};
  assert.equal(hasFieldErrors(errors), false);
  assert.equal(countFieldErrorMessages(errors), 0);
  assert.equal(getFirstFieldError(errors, FIELD_ERROR_KEYS.withdrawalAmount), null);

  pushFieldError(errors, FIELD_ERROR_KEYS.withdrawalAmount, "one");
  pushFieldError(errors, FIELD_ERROR_KEYS.withdrawalAmount, "two");
  pushFieldError(errors, FIELD_ERROR_KEYS.stakingAddress, "bad");

  assert.equal(hasFieldErrors(errors), true);
  assert.equal(countFieldErrorMessages(errors), 3);
  assert.equal(getFirstFieldError(errors, FIELD_ERROR_KEYS.withdrawalAmount), "one");
  assert.equal(getFirstFieldError(errors, FIELD_ERROR_KEYS.publish), null);
});

test("validateField records the schema issue under the target key", () => {
  const errors: FieldErrors = {};
  validateField(errors, FIELD_ERROR_KEYS.withdrawalAmount, NON_NEGATIVE_INTEGER_SCHEMA, "-1");
  assert.equal(errors[FIELD_ERROR_KEYS.withdrawalAmount]?.length, 1);
  assert.match(errors[FIELD_ERROR_KEYS.withdrawalAmount]![0]!, /whole number/);
  // form key must not leak
  assert.equal(errors.form, undefined);
});

test("validateField does nothing when the value is valid", () => {
  const errors: FieldErrors = {};
  validateField(errors, FIELD_ERROR_KEYS.withdrawalAmount, NON_NEGATIVE_INTEGER_SCHEMA, "3");
  assert.deepEqual(errors, {});
});

test("validateAssetRows skips fully-empty rows and flags partial rows", () => {
  const errors: FieldErrors = {};
  const assets: Asset[] = [
    { unit: "", quantity: "" }, // fully empty -> ignored
    { unit: "lovelace", quantity: "" }, // partial -> flagged
    { unit: "", quantity: "5" } // partial -> flagged
  ];
  validateAssetRows(errors, FIELD_ERROR_KEYS.withdrawalAmount, assets);
  assert.equal(errors[FIELD_ERROR_KEYS.withdrawalAmount]?.length, 2);
  assert.match(errors[FIELD_ERROR_KEYS.withdrawalAmount]![0]!, /Complete asset row 2/);
  assert.match(errors[FIELD_ERROR_KEYS.withdrawalAmount]![1]!, /Complete asset row 3/);
});

test("validateAssetRows validates quantity of complete rows", () => {
  const errors: FieldErrors = {};
  validateAssetRows(errors, FIELD_ERROR_KEYS.withdrawalAmount, [{ unit: "lovelace", quantity: "-4" }]);
  assert.equal(errors[FIELD_ERROR_KEYS.withdrawalAmount]?.length, 1);
  assert.match(errors[FIELD_ERROR_KEYS.withdrawalAmount]![0]!, /whole number/);
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
  validateWalletInputRefs(single, FIELD_ERROR_KEYS.fundPools, [], 1);
  assert.match(single[FIELD_ERROR_KEYS.fundPools]![0]!, /at least one fund pool/);

  const many: FieldErrors = {};
  validateWalletInputRefs(many, FIELD_ERROR_KEYS.fundPools, [], 2);
  assert.match(many[FIELD_ERROR_KEYS.fundPools]![0]!, /at least 2 fund pools/);
});

test("validateWalletInputRefs flags blank tx hashes and invalid output indexes", () => {
  const errors: FieldErrors = {};
  const refs: WalletInputRef[] = [
    { txHash: "", outputIndex: 0 },
    { txHash: "aa", outputIndex: -1 },
    { txHash: "bb", outputIndex: 1.5 }
  ];
  validateWalletInputRefs(errors, FIELD_ERROR_KEYS.fundPools, refs);
  // ref1: missing hash; ref2: invalid index; ref3: invalid index
  assert.equal(errors[FIELD_ERROR_KEYS.fundPools]?.length, 3);
  assert.match(errors[FIELD_ERROR_KEYS.fundPools]![0]!, /Fund pool 1 is missing a transaction hash/);
  assert.match(errors[FIELD_ERROR_KEYS.fundPools]![1]!, /Fund pool 2 needs a valid output index/);
  assert.match(errors[FIELD_ERROR_KEYS.fundPools]![2]!, /Fund pool 3 needs a valid output index/);
});

test("validateWalletInputRefs passes clean refs with no minimum", () => {
  const errors: FieldErrors = {};
  validateWalletInputRefs(errors, FIELD_ERROR_KEYS.fundPools, [{ txHash: "aa", outputIndex: 0 }]);
  assert.deepEqual(errors, {});
});

test("validateTransferRows rejects unusable addresses and delegates to asset validation", () => {
  const errors: FieldErrors = {};
  const transfers = [
    { address: "", amount: [{ unit: "lovelace", quantity: "1" }] },
    { address: "addr1", amount: [{ unit: "lovelace", quantity: "-1" }] }
  ] as TransferFormState[];
  validateTransferRows(errors, FIELD_ERROR_KEYS.transfersForwardedOutputs, transfers);
  // Row 2 now yields two errors, not one: `addr1` is a mainnet address, which this preprod
  // app previously accepted in silence.
  assert.equal(errors[FIELD_ERROR_KEYS.transfersForwardedOutputs]?.length, 3);
  assert.match(errors[FIELD_ERROR_KEYS.transfersForwardedOutputs]![0]!, /Recipient 1: Enter the address you want to send to/);
  assert.match(errors[FIELD_ERROR_KEYS.transfersForwardedOutputs]![1]!, /Recipient 2: That is a Cardano mainnet address/);
  assert.match(errors[FIELD_ERROR_KEYS.transfersForwardedOutputs]![2]!, /whole number/);
});

test("validateTransferRows accepts a well-formed preprod address", () => {
  const errors: FieldErrors = {};
  const transfers = [
    { address: VALID_PREPROD_ADDRESS, amount: [{ unit: "lovelace", quantity: "1" }] }
  ] as TransferFormState[];
  validateTransferRows(errors, FIELD_ERROR_KEYS.transfersForwardedOutputs, transfers);
  assert.deepEqual(errors, {});
});

test("validateTransferRows with minimumCount 1 blocks a send that stages no payout", () => {
  const errors: FieldErrors = {};
  validateTransferRows(errors, FIELD_ERROR_KEYS.transfersForwardedOutputs, [], 1);
  // Under a key of its own, not the section key: "Transfers / forwarded outputs" named the
  // advanced section while the message talked about staging the first payout, so the rail
  // paired one with the other and the section's inline hint repeated it a third time.
  assert.equal(errors[FIELD_ERROR_KEYS.payouts]?.length, 1);
  assert.equal(errors[FIELD_ERROR_KEYS.transfersForwardedOutputs], undefined);
  assert.match(errors[FIELD_ERROR_KEYS.payouts][0]!, /No payout is staged yet/);
});

test("validateTransferRows with the default minimum still accepts an empty list", () => {
  // `update-state` and `manage-streaming-payments` share this validator and legitimately
  // stage no transfer, so the gate has to stay opt-in.
  const errors: FieldErrors = {};
  validateTransferRows(errors, FIELD_ERROR_KEYS.transfersForwardedOutputs, []);
  assert.deepEqual(errors, {});
});

test("validateWalletScriptOutputs validates each output's asset rows", () => {
  const errors: FieldErrors = {};
  const outputs = [
    { amount: [{ unit: "lovelace", quantity: "bad" }] }
  ] as WalletScriptOutputFormState[];
  validateWalletScriptOutputs(errors, FIELD_ERROR_KEYS.newFundPools, outputs);
  assert.equal(errors[FIELD_ERROR_KEYS.newFundPools]?.length, 1);
  assert.match(errors[FIELD_ERROR_KEYS.newFundPools]![0]!, /whole number/);
});

test("appendValidationErrors pushes each message under the key", () => {
  const errors: FieldErrors = {};
  appendValidationErrors(errors, FIELD_ERROR_KEYS.outputState, ["a", "b"]);
  assert.deepEqual(errors[FIELD_ERROR_KEYS.outputState], ["a", "b"]);
  assert.equal(countFieldErrorMessages(errors), 2);
});

// This is the boundary where contract validation output becomes UI text. Without the rewrite
// here, the review rail printed the datum path as its highest-priority sentence.
test("appendValidationErrors names the field instead of the datum path", () => {
  const errors: FieldErrors = {};
  appendValidationErrors(errors, FIELD_ERROR_KEYS.walletRules, [
    "state.beneficiaries[0].beneficiary_wallets must list at least one wallet."
  ]);

  assert.equal(
    errors[FIELD_ERROR_KEYS.walletRules]?.[0],
    "Recovery contact 1's wallet IDs must list at least one wallet."
  );
  assert.doesNotMatch(errors[FIELD_ERROR_KEYS.walletRules]![0]!, /\bstate\./);
});
