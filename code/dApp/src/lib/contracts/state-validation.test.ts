import assert from "node:assert/strict";
import test from "node:test";

import type { ConstrData } from "@/lib/types/contracts";
import {
  createDefaultStateForm,
  createDefaultUserFormState,
  stateFormToDatum,
  type BeneficiaryFormState,
  type StateFormState,
  type UserFormState
} from "@/lib/contracts/state-form";
import {
  collectStateDatumWarnings,
  validateMintStateDatum,
  validateStateDatum
} from "@/lib/contracts/state-validation";
import { MAX_WALLET_NAME_BYTES } from "@/lib/contracts/state-wallet-name";

// --- builders ----------------------------------------------------------------

function adminUser(id = "0", wallet = "aa"): UserFormState {
  return {
    ...createDefaultUserFormState(id),
    isAdmin: true,
    canRenewProofOfLife: true,
    wallets: [wallet],
    preset: "admin"
  };
}

function formWith(overrides: Partial<StateFormState>): StateFormState {
  return { ...createDefaultStateForm(), ...overrides };
}

function beneficiary(overrides: Partial<BeneficiaryFormState> = {}): BeneficiaryFormState {
  return {
    id: "0",
    wallets: ["cc"],
    unlockAfterMode: "none",
    unlockAfter: "",
    weight: "1",
    ...overrides
  };
}

// A structurally valid on-chain Address datum (VerificationKey credential, no
// stake) — enough to pass `isAddressData` without a real bech32 address.
const VALID_PAYOUT_ADDRESS: ConstrData = {
  alternative: 0,
  fields: [
    { alternative: 0, fields: ["aa".repeat(28)] },
    { alternative: 1, fields: [] }
  ]
};

function withStreamingPayments(base: ConstrData, payments: ConstrData[]): ConstrData {
  return {
    ...base,
    fields: [base.fields[0], base.fields[1], payments, base.fields[3], base.fields[4]]
  };
}

function hasError(errors: string[], pattern: RegExp): boolean {
  return errors.some((error) => pattern.test(error));
}

// --- validateStateDatum: valid configurations --------------------------------

test("a single-admin wallet validates with no errors", () => {
  const datum = stateFormToDatum(formWith({ users: [adminUser()] }));
  assert.deepEqual(validateStateDatum(datum), []);
});

test("a satisfiable multisig with no admin is a valid access path", () => {
  const u1: UserFormState = {
    ...createDefaultUserFormState("0"),
    wallets: ["aa"],
    multiSigPowerMode: "some",
    multiSigPower: "1",
    preset: "custom"
  };
  const u2: UserFormState = {
    ...createDefaultUserFormState("1"),
    wallets: ["bb"],
    multiSigPowerMode: "some",
    multiSigPower: "1",
    preset: "custom"
  };
  const datum = stateFormToDatum(
    formWith({ users: [u1, u2], multiSigThresholdMode: "some", multiSigThreshold: "2" })
  );
  assert.deepEqual(validateStateDatum(datum), []);
});

// --- validateStateDatum: access-path / reachability --------------------------

test("an empty wallet has no usable access path", () => {
  const errors = validateStateDatum(stateFormToDatum(createDefaultStateForm()));
  assert.ok(hasError(errors, /at least one owner/));
});

test("an unsatisfiable multisig (power < threshold) is not a valid path", () => {
  const u1: UserFormState = {
    ...createDefaultUserFormState("0"),
    wallets: ["aa"],
    multiSigPowerMode: "some",
    multiSigPower: "1",
    preset: "custom"
  };
  const datum = stateFormToDatum(
    formWith({ users: [u1], multiSigThresholdMode: "some", multiSigThreshold: "2" })
  );
  assert.ok(hasError(validateStateDatum(datum), /at least one owner/));
});

// A wallet-less admin is not a usable access path: it can never sign, so a
// wallet whose only entry is such a record is permanently stranded and must be
// rejected (mirrors on-chain `has_reachable_access_path`). Regression for the
// wallet-less-admin gap (security review 2026-07).
test("a wallet-less admin is not a usable access path", () => {
  const datum = stateFormToDatum(formWith({ users: [{ ...adminUser(), wallets: [] }] }));
  assert.ok(hasError(validateStateDatum(datum), /at least one owner/));
});

// A wallet-less admin record stays legal alongside another reachable path — it
// is merely inert, not a reachability error.
test("a wallet-less admin is allowed when a signable beneficiary exists", () => {
  const datum = stateFormToDatum(
    formWith({
      users: [{ ...adminUser(), wallets: [] }],
      beneficiaries: [beneficiary()],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "100",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "50"
    })
  );
  assert.deepEqual(validateStateDatum(datum), []);
});

// --- validateStateDatum: duplicate / cap rules -------------------------------

test("duplicate user ids are rejected", () => {
  const datum = stateFormToDatum(formWith({ users: [adminUser("0", "aa"), adminUser("0", "bb")] }));
  assert.ok(hasError(validateStateDatum(datum), /duplicate id 0/));
});

test("more than the maximum number of owners is rejected", () => {
  const users = Array.from({ length: 16 }, (_, index) => adminUser(String(index), `key${index}`));
  const datum = stateFormToDatum(formWith({ users }));
  assert.ok(hasError(validateStateDatum(datum), /at most 15 owners/));
});

// --- validateStateDatum: beneficiary rules -----------------------------------

test("a beneficiary with no wallet is rejected", () => {
  const datum = stateFormToDatum(
    formWith({
      users: [adminUser()],
      beneficiaries: [beneficiary({ wallets: [] })],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "1000",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "60"
    })
  );
  assert.ok(hasError(validateStateDatum(datum), /must list at least one wallet/));
});

test("beneficiaries require a proof-of-life safety timer", () => {
  const datum = stateFormToDatum(
    formWith({ users: [adminUser()], beneficiaries: [beneficiary()] })
  );
  assert.ok(hasError(validateStateDatum(datum), /need a safety timer/));
});

test("two beneficiaries may not share a wallet", () => {
  const datum = stateFormToDatum(
    formWith({
      users: [adminUser()],
      beneficiaries: [
        beneficiary({ id: "0", wallets: ["cc"] }),
        beneficiary({ id: "1", wallets: ["cc"] })
      ],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "1000",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "60"
    })
  );
  assert.ok(hasError(validateStateDatum(datum), /must not share beneficiary wallets/));
});

// --- validateStateDatum: wallet name -----------------------------------------

test("an over-long wallet name is rejected", () => {
  const base = stateFormToDatum(formWith({ users: [adminUser()] }));
  const longName = "61".repeat(MAX_WALLET_NAME_BYTES + 20);
  const datum: ConstrData = {
    ...base,
    fields: [base.fields[0], base.fields[1], base.fields[2], longName, base.fields[4]]
  };
  assert.ok(hasError(validateStateDatum(datum), new RegExp(`fit in ${MAX_WALLET_NAME_BYTES} bytes`)));
});

// --- validateStateDatum: streaming payments ----------------------------------

test("a streaming payment with start >= end is rejected", () => {
  const payment: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 0, "", "", 0, 100, 50]
  };
  const datum = withStreamingPayments(
    stateFormToDatum(formWith({ users: [adminUser()] })),
    [payment]
  );
  assert.ok(hasError(validateStateDatum(datum), /start date must be before the end date/));
});

test("a streaming payment with a half-specified asset is rejected", () => {
  const payment: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 0, "aa".repeat(28), "", 0, 0, 100]
  };
  const datum = withStreamingPayments(
    stateFormToDatum(formWith({ users: [adminUser()] })),
    [payment]
  );
  assert.ok(hasError(validateStateDatum(datum), /set both the policy id and asset name/));
});

test("validateMintStateDatum delegates to validateStateDatum", () => {
  const datum = stateFormToDatum(formWith({ users: [adminUser()] }));
  assert.deepEqual(validateMintStateDatum(datum), validateStateDatum(datum));
});

// --- collectStateDatumWarnings (non-blocking advisories) ---------------------

test("a clean admin wallet produces no warnings", () => {
  const datum = stateFormToDatum(formWith({ users: [adminUser()] }));
  assert.deepEqual(collectStateDatumWarnings(datum, 2_000), []);
});

test("warns when a recovery contact can already withdraw (lapsed timer)", () => {
  const datum = stateFormToDatum(
    formWith({
      users: [adminUser()],
      beneficiaries: [beneficiary()],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "1000",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "60"
    })
  );
  assert.ok(hasError(collectStateDatumWarnings(datum, 2_000), /already withdraw/));
});

test("warns when the only recovery path unlocks far in the future", () => {
  const now = 1_000_000_000_000;
  const far = now + 11 * 365 * 24 * 60 * 60 * 1000;
  const datum = stateFormToDatum(
    formWith({
      users: [],
      beneficiaries: [beneficiary({ unlockAfterMode: "some", unlockAfter: String(far) })],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "1",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "60"
    })
  );
  assert.ok(hasError(collectStateDatumWarnings(datum, now), /far in the future/));
});
