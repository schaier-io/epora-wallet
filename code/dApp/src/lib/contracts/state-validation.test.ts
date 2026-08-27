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
  validateFreshStreamingPayments,
  validateMintStateDatum,
  validateStateDatum
} from "@/lib/contracts/state-validation";
import { MAX_WALLET_NAME_BYTES } from "@/lib/contracts/state-wallet-name";

// --- builders ----------------------------------------------------------------

const KEY_A = "aa".repeat(28);
const KEY_B = "bb".repeat(28);
const KEY_C = "cc".repeat(28);

function keyFor(index: number): string {
  return index.toString(16).padStart(2, "0").repeat(28);
}

function adminUser(id = "0", wallet = KEY_A): UserFormState {
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
    wallets: [KEY_C],
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
  const fields = [...base.fields];
  fields[2] = payments;
  return {
    ...base,
    fields
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
    wallets: [KEY_A],
    multiSigPowerMode: "some",
    multiSigPower: "1",
    preset: "custom"
  };
  const u2: UserFormState = {
    ...createDefaultUserFormState("1"),
    wallets: [KEY_B],
    multiSigPowerMode: "some",
    multiSigPower: "1",
    preset: "custom"
  };
  const datum = stateFormToDatum(
    formWith({ users: [u1, u2], multiSigThresholdMode: "some", multiSigThreshold: "2" })
  );
  assert.deepEqual(validateStateDatum(datum), []);
});

test("credential hashes must be exactly 28 bytes", () => {
  const shortHashDatum = stateFormToDatum(
    formWith({ users: [adminUser("0", "aa".repeat(27))] })
  );
  const longHashDatum = stateFormToDatum(
    formWith({ users: [adminUser("0", "aa".repeat(29))] })
  );

  assert.ok(hasError(validateStateDatum(shortHashDatum), /28-byte Cardano credential hash/));
  assert.ok(hasError(validateStateDatum(longHashDatum), /28-byte Cardano credential hash/));
});

test("credential hashes must use hexadecimal encoding", () => {
  const datum = stateFormToDatum(formWith({ users: [adminUser("0", "zz".repeat(28))] }));
  assert.ok(hasError(validateStateDatum(datum), /56 hexadecimal characters/));
});

test("payout and intended stake credentials require valid ledger hashes", () => {
  const malformedPayout: ConstrData = {
    alternative: 0,
    fields: [
      0,
      {
        alternative: 0,
        fields: [{ alternative: 0, fields: ["aa"] }, { alternative: 1, fields: [] }]
      },
      0,
      "",
      "",
      1,
      0,
      100
    ]
  };
  const base = stateFormToDatum(formWith({ users: [adminUser()] }));
  const malformedStake: ConstrData = {
    ...base,
    fields: [
      base.fields[0]!,
      base.fields[1]!,
      base.fields[2]!,
      base.fields[3]!,
      { alternative: 0, fields: [{ alternative: 0, fields: ["bb"] }] },
      base.fields[5]!
    ]
  };

  assert.ok(
    hasError(validateStateDatum(withStreamingPayments(base, [malformedPayout])), /valid Cardano address/)
  );
  assert.ok(hasError(validateStateDatum(malformedStake), /intended_stake_credential/));
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
  const datum = stateFormToDatum(
    formWith({ users: [adminUser("0", KEY_A), adminUser("0", KEY_B)] })
  );
  assert.ok(hasError(validateStateDatum(datum), /duplicate id 0/));
});

test("more than the maximum number of owners is rejected", () => {
  const users = Array.from({ length: 16 }, (_, index) => adminUser(String(index), keyFor(index)));
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

test("recovery contacts require a proof of life", () => {
  const datum = stateFormToDatum(
    formWith({ users: [adminUser()], beneficiaries: [beneficiary()] })
  );
  assert.ok(hasError(validateStateDatum(datum), /need a proof of life/));
});

test("two beneficiaries may not share a wallet", () => {
  const datum = stateFormToDatum(
    formWith({
      users: [adminUser()],
      beneficiaries: [
        beneficiary({ id: "0", wallets: [KEY_C] }),
        beneficiary({ id: "1", wallets: [KEY_C] })
      ],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "1000",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "60"
    })
  );
  assert.ok(hasError(validateStateDatum(datum), /must not share beneficiary wallets/));
});

test("beneficiary duplicate checks normalize credential hex case", () => {
  const base = {
    users: [adminUser()],
    proofOfLifeUnlockTimeMode: "some" as const,
    proofOfLifeUnlockTime: "1000",
    proofOfLifeIncrementMode: "some" as const,
    proofOfLifeIncrement: "60"
  };
  const withinOne = stateFormToDatum(
    formWith({
      ...base,
      beneficiaries: [beneficiary({ wallets: [KEY_C, KEY_C.toUpperCase()] })]
    })
  );
  const acrossTwo = stateFormToDatum(
    formWith({
      ...base,
      beneficiaries: [
        beneficiary({ id: "0", wallets: [KEY_C] }),
        beneficiary({ id: "1", wallets: [KEY_C.toUpperCase()] })
      ]
    })
  );

  assert.ok(hasError(validateStateDatum(withinOne), /contains duplicate wallet/));
  assert.ok(hasError(validateStateDatum(acrossTwo), /must not share beneficiary wallets/));
});

// --- validateStateDatum: wallet name -----------------------------------------

test("an over-long wallet name is rejected", () => {
  const base = stateFormToDatum(formWith({ users: [adminUser()] }));
  const longName = "61".repeat(MAX_WALLET_NAME_BYTES + 20);
  const datum: ConstrData = {
    ...base,
    fields: [base.fields[0]!, base.fields[1]!, base.fields[2]!, longName, base.fields[4]!]
  };
  assert.ok(hasError(validateStateDatum(datum), new RegExp(`fit in ${MAX_WALLET_NAME_BYTES} bytes`)));
});

// --- validateStateDatum: streaming payments ----------------------------------

test("a streaming payment with start after end is rejected", () => {
  const payment: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 0, "", "", 0, 100, 50]
  };
  const datum = withStreamingPayments(
    stateFormToDatum(formWith({ users: [adminUser()] })),
    [payment]
  );
  assert.ok(hasError(validateStateDatum(datum), /start date cannot be after the end date/));
});

test("a receiver-shortened stream may have zero duration", () => {
  const payment: ConstrData = {
    alternative: 0,
    fields: [
      0,
      VALID_PAYOUT_ADDRESS,
      0,
      "",
      "",
      86_400_000,
      100,
      100
    ]
  };
  const datum = withStreamingPayments(
    stateFormToDatum(formWith({ users: [adminUser()] })),
    [payment]
  );

  assert.deepEqual(validateStateDatum(datum), []);
});

test("manage allows forwarded zero-duration/accrued state but rejects it for a fresh id", () => {
  const zeroDuration: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 42, "", "", 1, 100, 100]
  };
  const base = stateFormToDatum(formWith({ users: [adminUser()] }));
  const withExisting = withStreamingPayments(base, [zeroDuration]);

  assert.deepEqual(
    validateFreshStreamingPayments(withExisting, withExisting),
    []
  );
  const freshErrors = validateFreshStreamingPayments(base, withExisting);
  assert.ok(hasError(freshErrors, /must start before it ends/));
  assert.ok(
    hasError(freshErrors, /must start with zero already-paid amount/)
  );
});

test("a streaming payment with a half-specified asset is rejected", () => {
  const payment: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 0, "", "01", 0, 0, 100]
  };
  const datum = withStreamingPayments(
    stateFormToDatum(formWith({ users: [adminUser()] })),
    [payment]
  );
  assert.ok(hasError(validateStateDatum(datum), /policy id must be a 28-byte hexadecimal hash/));
});

test("a native asset may have an empty asset name", () => {
  const payment: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 0, "aa".repeat(28), "", 0, 0, 100]
  };
  const datum = withStreamingPayments(
    stateFormToDatum(formWith({ users: [adminUser()] })),
    [payment]
  );
  assert.deepEqual(validateStateDatum(datum), []);
});

test("streaming asset ids enforce policy and asset-name ledger widths", () => {
  const base = stateFormToDatum(formWith({ users: [adminUser()] }));
  const malformedPolicy: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 0, "aa".repeat(27), "", 0, 0, 100]
  };
  const longName: ConstrData = {
    alternative: 0,
    fields: [0, VALID_PAYOUT_ADDRESS, 0, "aa".repeat(28), "bb".repeat(33), 0, 0, 100]
  };

  assert.ok(
    hasError(
      validateStateDatum(withStreamingPayments(base, [malformedPolicy])),
      /policy id must be a 28-byte hexadecimal hash/
    )
  );
  assert.ok(
    hasError(
      validateStateDatum(withStreamingPayments(base, [longName])),
      /asset name must be 0 to 32 bytes/
    )
  );
});

test("validateMintStateDatum delegates to validateStateDatum", () => {
  const datum = stateFormToDatum(formWith({ users: [adminUser()] }));
  assert.deepEqual(validateMintStateDatum(datum), validateStateDatum(datum));
});

test("mint rejects a fresh zero-duration stream and a seeded payout timestamp", () => {
  const payment: ConstrData = {
    alternative: 0,
    fields: [
      0,
      VALID_PAYOUT_ADDRESS,
      1,
      "",
      "",
      0,
      0,
      0
    ]
  };
  const base = withStreamingPayments(
    stateFormToDatum(formWith({ users: [adminUser()] })),
    [payment]
  );
  const fields = [...base.fields];
  fields[5] = { alternative: 0, fields: [25] };
  const datum = { ...base, fields };
  const errors = validateMintStateDatum(datum);

  assert.ok(hasError(errors, /Fresh streaming payment 1 must start before it ends/));
  assert.ok(hasError(errors, /must start with zero already-paid amount/));
  assert.ok(hasError(errors, /must start without a non-admin payout timestamp/));
});

// --- collectStateDatumWarnings (non-blocking advisories) ---------------------

test("a clean admin wallet produces no warnings", () => {
  const datum = stateFormToDatum(formWith({ users: [adminUser()] }));
  assert.deepEqual(collectStateDatumWarnings(datum, 2_000), []);
});

test("warns when one key contributes power through multiple owner records", () => {
  const poweredUser = (id: string, power: string): UserFormState => ({
    ...createDefaultUserFormState(id),
    wallets: [KEY_A],
    multiSigPowerMode: "some",
    multiSigPower: power,
    preset: "custom"
  });
  const datum = stateFormToDatum(
    formWith({
      users: [poweredUser("0", "1"), poweredUser("1", "2")],
      multiSigThresholdMode: "some",
      multiSigThreshold: "3"
    })
  );

  assert.ok(
    hasError(
      collectStateDatumWarnings(datum, 2_000),
      /One signature contributes their combined power 3/
    )
  );
});

test("normalizes credential hex case when warning about duplicate multisig power", () => {
  const poweredUser = (id: string, wallet: string, power: string): UserFormState => ({
    ...createDefaultUserFormState(id),
    wallets: [wallet],
    multiSigPowerMode: "some",
    multiSigPower: power,
    preset: "custom"
  });
  const datum = stateFormToDatum(
    formWith({
      users: [poweredUser("0", KEY_A.toUpperCase(), "1"), poweredUser("1", KEY_A, "2")],
      multiSigThresholdMode: "some",
      multiSigThreshold: "3"
    })
  );

  assert.ok(
    hasError(
      collectStateDatumWarnings(datum, 2_000),
      /One signature contributes their combined power 3/
    )
  );
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

test("warns when the proof of life is armed but no recovery contact exists", () => {
  // The mirror of the hard rule above it: contacts without a timer are rejected, and until
  // now a timer without contacts passed silently, so a user could arm a switch that
  // protects nobody and be told there were no issues.
  const datum = stateFormToDatum(
    formWith({
      users: [adminUser()],
      beneficiaries: [],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "9000",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "60"
    })
  );

  assert.ok(hasError(collectStateDatumWarnings(datum, 2_000), /protects nothing/));
  // Advisory, never an error: rejecting it would deadlock against the rule that recovery
  // contacts require a timer, leaving neither addable first.
  assert.equal(
    hasError(validateStateDatum(datum), /protects nothing/),
    false
  );
});

test("no timer-protects-nobody warning once a recovery contact is named", () => {
  const datum = stateFormToDatum(
    formWith({
      users: [adminUser()],
      beneficiaries: [beneficiary()],
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: "9000",
      proofOfLifeIncrementMode: "some",
      proofOfLifeIncrement: "60"
    })
  );

  assert.equal(hasError(collectStateDatumWarnings(datum, 2_000), /protects nothing/), false);
});
