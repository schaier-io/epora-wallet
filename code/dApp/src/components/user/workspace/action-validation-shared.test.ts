import { test } from "node:test";
import assert from "node:assert/strict";
import { type FieldErrors } from "@/components/user/flow-types";
import {
  requireZeroAdminConfirmation,
  validateSpecificWakeUpDate,
  validateSttInputRef
} from "./action-validation-shared";
import { FIELD_ERROR_IDS } from "./field-error-ids";
import { type StateFormState } from "@/lib/contracts/state-form";
import { extractErrorMessage } from "@/lib/utils/errors";

function stateFormWithAdmins(adminCount: number): StateFormState {
  return {
    users: Array.from({ length: adminCount }, (_, index) => ({
      id: `${index}`,
      isAdmin: true
    }))
  } as unknown as StateFormState;
}

test("validateSttInputRef requires a tx hash and whole-number index", () => {
  const errors: FieldErrors = {};
  validateSttInputRef(errors, "", "not-a-number");
  assert.ok(errors[FIELD_ERROR_IDS.walletIdentityTransactionHash]);
  assert.ok(errors[FIELD_ERROR_IDS.walletIdentityOutputIndex]);
});

test("validateSttInputRef accepts a hash with an empty optional index", () => {
  const errors: FieldErrors = {};
  validateSttInputRef(errors, "abc123", "");
  assert.deepEqual(errors, {});
});

test("requireZeroAdminConfirmation flags wallets with no direct owner", () => {
  const errors: FieldErrors = {};
  requireZeroAdminConfirmation(
    errors,
    stateFormWithAdmins(0),
    false,
    "Confirm that this wallet has no direct owner before creating the wallet."
  );
  assert.match(
    errors[FIELD_ERROR_IDS.noDirectOwner]?.[0] ?? "",
    /before creating the wallet\./
  );
});

test("requireZeroAdminConfirmation passes when confirmed or admins exist", () => {
  const confirmed: FieldErrors = {};
  requireZeroAdminConfirmation(confirmed, stateFormWithAdmins(0), true, "Full localized message.");
  assert.deepEqual(confirmed, {});

  const hasAdmins: FieldErrors = {};
  requireZeroAdminConfirmation(hasAdmins, stateFormWithAdmins(1), false, "Full localized message.");
  assert.deepEqual(hasAdmins, {});
});

test("validateSpecificWakeUpDate only applies in specific mode", () => {
  const off: FieldErrors = {};
  validateSpecificWakeUpDate(off, "none", "", "Choose a valid local date.");
  assert.deepEqual(off, {});

  const missing: FieldErrors = {};
  validateSpecificWakeUpDate(missing, "specific", "", "Choose a valid local date.");
  assert.ok(missing[FIELD_ERROR_IDS.specificWakeUpTimerDate]);

  const invalid: FieldErrors = {};
  validateSpecificWakeUpDate(invalid, "specific", "tomorrow", "Choose a valid local date.");
  assert.match(
    invalid[FIELD_ERROR_IDS.specificWakeUpTimerDate]?.[0] ?? "",
    /valid local date/
  );

  const valid: FieldErrors = {};
  validateSpecificWakeUpDate(valid, "specific", "1750000000000", "Choose a valid local date.");
  assert.deepEqual(valid, {});
});

test("extractErrorMessage prefers Error messages and falls back otherwise", () => {
  assert.equal(extractErrorMessage(new Error("boom"), "fallback"), "boom");
  assert.equal(extractErrorMessage(new Error("  "), "fallback"), "fallback");
  assert.equal(extractErrorMessage("string error", "fallback"), "fallback");
  assert.equal(extractErrorMessage(undefined, "fallback"), "fallback");
});
