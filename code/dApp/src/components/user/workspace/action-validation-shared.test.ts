import { test } from "node:test";
import assert from "node:assert/strict";
import { type FieldErrors } from "@/components/user/flow-types";
import {
  requireStakingEnabled,
  requireZeroAdminConfirmation,
  validateSpecificWakeUpDate,
  validateSttInputRef
} from "./action-validation-shared";
import {
  INTENDED_STAKE_CREDENTIAL_NONE,
  hasIntendedStakeCredential
} from "@/lib/contracts/state-layout";
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
  assert.ok(errors["STT input tx hash"]);
  assert.ok(errors["STT input index"]);
});

test("validateSttInputRef accepts a hash with an empty optional index", () => {
  const errors: FieldErrors = {};
  validateSttInputRef(errors, "abc123", "");
  assert.deepEqual(errors, {});
});

test("requireZeroAdminConfirmation flags unconfirmed zero-admin states", () => {
  const errors: FieldErrors = {};
  requireZeroAdminConfirmation(errors, stateFormWithAdmins(0), false, "mint");
  assert.match(
    errors["Zero-admin confirmation"]?.[0] ?? "",
    /before building mint\./
  );
});

test("requireZeroAdminConfirmation passes when confirmed or admins exist", () => {
  const confirmed: FieldErrors = {};
  requireZeroAdminConfirmation(confirmed, stateFormWithAdmins(0), true, "mint");
  assert.deepEqual(confirmed, {});

  const hasAdmins: FieldErrors = {};
  requireZeroAdminConfirmation(hasAdmins, stateFormWithAdmins(1), false, "mint");
  assert.deepEqual(hasAdmins, {});
});

test("validateSpecificWakeUpDate only applies in specific mode", () => {
  const off: FieldErrors = {};
  validateSpecificWakeUpDate(off, "none", "");
  assert.deepEqual(off, {});

  const missing: FieldErrors = {};
  validateSpecificWakeUpDate(missing, "specific", "");
  assert.ok(missing["Specific wake-up timer date"]);

  const invalid: FieldErrors = {};
  validateSpecificWakeUpDate(invalid, "specific", "tomorrow");
  assert.match(
    invalid["Specific wake-up timer date"]?.[0] ?? "",
    /valid local date/
  );

  const valid: FieldErrors = {};
  validateSpecificWakeUpDate(valid, "specific", "1750000000000");
  assert.deepEqual(valid, {});
});

test("extractErrorMessage prefers Error messages and falls back otherwise", () => {
  assert.equal(extractErrorMessage(new Error("boom"), "fallback"), "boom");
  assert.equal(extractErrorMessage(new Error("  "), "fallback"), "fallback");
  assert.equal(extractErrorMessage("string error", "fallback"), "fallback");
  assert.equal(extractErrorMessage(undefined, "fallback"), "fallback");
});

// `Some(credential)` is Aiken `Option` constructor 0; the field holds the credential.
const STAKE_CREDENTIAL_SOME = {
  alternative: 0,
  fields: [{ alternative: 0, fields: ["ab".repeat(28)] }]
};

function stateFormWithStakeCredential(credential: unknown): StateFormState {
  return { intendedStakeCredential: credential } as unknown as StateFormState;
}

test("hasIntendedStakeCredential separates Some from None", () => {
  assert.equal(hasIntendedStakeCredential(STAKE_CREDENTIAL_SOME), true);
  assert.equal(hasIntendedStakeCredential(INTENDED_STAKE_CREDENTIAL_NONE), false);
  assert.equal(hasIntendedStakeCredential(null), false);
  assert.equal(hasIntendedStakeCredential("stake_test1..."), false);
});

test("requireStakingEnabled blocks a claim on a wallet that delegates to nothing", () => {
  const errors: FieldErrors = {};
  requireStakingEnabled(errors, stateFormWithStakeCredential(INTENDED_STAKE_CREDENTIAL_NONE));
  assert.match(errors["Staking"]?.[0] ?? "", /earned nothing to claim/);
});

test("requireStakingEnabled passes a wallet with a stake credential", () => {
  const errors: FieldErrors = {};
  requireStakingEnabled(errors, stateFormWithStakeCredential(STAKE_CREDENTIAL_SOME));
  assert.deepEqual(errors, {});
});
