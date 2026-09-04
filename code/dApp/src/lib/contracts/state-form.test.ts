import assert from "node:assert/strict";
import test from "node:test";

import {
  INTENDED_STAKE_CREDENTIAL_NONE,
  LAST_NON_ADMIN_PAYOUT_AT_NONE,
  readStateSections
} from "@/lib/contracts/state-layout";
import { parseValueData } from "@/lib/contracts/value-data";
import {
  applyProofOfLifeOverrideToStateForm,
  applyUserPreset,
  countAdminUsersInStateForm,
  createDefaultStateForm,
  createDefaultUserFormState,
  nextGeneratedId,
  stateFormFromDatum,
  stateFormToDatum,
  withFallbackAdminUserInStateForm,
  type StateFormState,
  type UserFormState
} from "@/lib/contracts/state-form";
import type { StateSections } from "@/lib/contracts/state-layout";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Condition extends true> = Condition;
type _WalletNameIsAlwaysPresent = Expect<Equal<StateSections["walletName"], string>>;

// --- applyUserPreset ---------------------------------------------------------

test("applyUserPreset('admin') forces admin flags and clears allowances", () => {
  const base: UserFormState = {
    ...createDefaultUserFormState("3"),
    perDayAllowance: [{ policyId: "", assetName: "", amount: "5" }],
    remainingAllowance: [{ policyId: "", assetName: "", amount: "2" }],
    multiSigPowerMode: "some",
    multiSigPower: "4"
  };

  const result = applyUserPreset(base, "admin");

  assert.equal(result.isAdmin, true);
  assert.equal(result.canRenewProofOfLife, true);
  assert.equal(result.multiSigPowerMode, "none");
  assert.equal(result.multiSigPower, "");
  assert.deepEqual(result.perDayAllowance, []);
  assert.deepEqual(result.remainingAllowance, []);
  assert.equal(result.preset, "admin");
});

test("applyUserPreset('limited-withdrawal') clears renew + multisig but keeps allowances", () => {
  const base: UserFormState = {
    ...createDefaultUserFormState("1"),
    isAdmin: true,
    canRenewProofOfLife: true,
    multiSigPowerMode: "some",
    multiSigPower: "4",
    perDayAllowance: [{ policyId: "", assetName: "", amount: "7" }]
  };

  const result = applyUserPreset(base, "limited-withdrawal");

  assert.equal(result.isAdmin, false);
  assert.equal(result.canRenewProofOfLife, false);
  assert.equal(result.multiSigPowerMode, "none");
  assert.equal(result.multiSigPower, "");
  assert.deepEqual(result.perDayAllowance, [{ policyId: "", assetName: "", amount: "7" }]);
  assert.equal(result.preset, "limited-withdrawal");
});

test("applyUserPreset('custom') only sets the preset, leaving flags untouched", () => {
  const base: UserFormState = {
    ...createDefaultUserFormState("2"),
    canRenewProofOfLife: true,
    multiSigPowerMode: "some",
    multiSigPower: "9"
  };

  const result = applyUserPreset(base, "custom");

  assert.equal(result.canRenewProofOfLife, true);
  assert.equal(result.multiSigPowerMode, "some");
  assert.equal(result.multiSigPower, "9");
  assert.equal(result.preset, "custom");
});

// --- nextGeneratedId ---------------------------------------------------------

test("nextGeneratedId returns max numeric id + 1, ignoring non-numeric ids", () => {
  assert.equal(nextGeneratedId([]), "0");
  assert.equal(nextGeneratedId([{ id: "0" }, { id: "3" }, { id: "1" }]), "4");
  assert.equal(nextGeneratedId([{ id: "abc" }]), "0");
  assert.equal(nextGeneratedId([{ id: "2" }, { id: "not-a-number" }]), "3");
});

// --- countAdminUsersInStateForm ---------------------------------------------

test("countAdminUsersInStateForm counts only admin users", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [
      { ...createDefaultUserFormState("0"), isAdmin: true },
      { ...createDefaultUserFormState("1"), isAdmin: false },
      { ...createDefaultUserFormState("2"), isAdmin: true }
    ]
  };

  assert.equal(countAdminUsersInStateForm(form), 2);
  assert.equal(countAdminUsersInStateForm(createDefaultStateForm()), 0);
});

// --- withFallbackAdminUserInStateForm ---------------------------------------

test("withFallbackAdminUserInStateForm is a no-op without a key hash", () => {
  const form = createDefaultStateForm();
  assert.equal(withFallbackAdminUserInStateForm(form, ""), form);
  assert.equal(withFallbackAdminUserInStateForm(form, "   "), form);
  assert.equal(withFallbackAdminUserInStateForm(form, null), form);
});

test("withFallbackAdminUserInStateForm is a no-op when an admin already exists", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [{ ...createDefaultUserFormState("0"), isAdmin: true }]
  };

  assert.equal(withFallbackAdminUserInStateForm(form, "deadbeef"), form);
});

test("withFallbackAdminUserInStateForm appends an admin bound to the key hash", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [{ ...createDefaultUserFormState("0"), isAdmin: false }]
  };

  const result = withFallbackAdminUserInStateForm(form, "  deadbeef  ");

  assert.equal(result.users.length, 2);
  const appended = result.users[1]!;
  assert.equal(appended.isAdmin, true);
  assert.equal(appended.canRenewProofOfLife, true);
  assert.equal(appended.preset, "admin");
  assert.deepEqual(appended.wallets, ["deadbeef"]);
  assert.equal(appended.id, "1");
});

// --- applyProofOfLifeOverrideToStateForm ------------------------------------

test("proof-of-life override 'none' clears all four proof-of-life fields", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "1000",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "60"
  };

  const result = applyProofOfLifeOverrideToStateForm(form, "none");

  assert.equal(result.proofOfLifeUnlockTimeMode, "none");
  assert.equal(result.proofOfLifeUnlockTime, "");
  assert.equal(result.proofOfLifeIncrementMode, "none");
  assert.equal(result.proofOfLifeIncrement, "");
});

test("proof-of-life override 'specific' sets the unlock time when increment is Some", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "60"
  };

  const result = applyProofOfLifeOverrideToStateForm(form, "specific", 123456);

  assert.equal(result.proofOfLifeUnlockTimeMode, "some");
  assert.equal(result.proofOfLifeUnlockTime, "123456");
});

test("proof-of-life override 'specific' throws when increment is None", () => {
  const form = createDefaultStateForm();
  assert.throws(
    () => applyProofOfLifeOverrideToStateForm(form, "specific", 123456),
    /proof_of_life_increment is None/
  );
});

test("proof-of-life override 'specific' rejects invalid timestamps", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "60"
  };

  assert.throws(() => applyProofOfLifeOverrideToStateForm(form, "specific", -1), /valid POSIX timestamp/);
  assert.throws(() => applyProofOfLifeOverrideToStateForm(form, "specific", 1.5), /valid POSIX timestamp/);
  assert.throws(() => applyProofOfLifeOverrideToStateForm(form, "specific"), /valid POSIX timestamp/);
});

test("proof-of-life override 'auto' leaves the form untouched when increment is None", () => {
  const form = createDefaultStateForm();
  assert.deepEqual(applyProofOfLifeOverrideToStateForm(form, "auto"), form);
});

test("proof-of-life override 'auto' anchors renewal to the tx's earliest bound", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "1000"
  };

  // The on-chain bound (proof_of_life.ak::expect_valid_renewal_window) requires
  // the renewed stamp to sit at or below tx_earliest + increment. This wallet's
  // first send renewed from tx_LATEST + increment and the validator rejected
  // every such transaction with an empty ScriptFailures trace.
  const result = applyProofOfLifeOverrideToStateForm(form, "auto", undefined, {
    earliestTimeMs: 5000,
    latestTimeMs: 6000
  });

  assert.equal(result.proofOfLifeUnlockTimeMode, "some");
  assert.equal(result.proofOfLifeUnlockTime, "6000");
});

test("proof-of-life override 'auto' leaves the stamp alone when the increment is shorter than the validity window", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "4000",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "1000"
  };

  // earliest 5000 + 1000 < latest 8000: no renewed stamp is legal for this tx.
  const result = applyProofOfLifeOverrideToStateForm(form, "auto", undefined, {
    earliestTimeMs: 5000,
    latestTimeMs: 8000
  });

  assert.equal(result.proofOfLifeUnlockTime, "4000");
});

test("proof-of-life override 'auto' keeps a later existing unlock time", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "999999",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "1000"
  };

  const result = applyProofOfLifeOverrideToStateForm(form, "auto", undefined, {
    earliestTimeMs: 5000,
    latestTimeMs: 6000
  });

  assert.equal(result.proofOfLifeUnlockTime, "999999");
});

// --- stateFormToDatum / stateFormFromDatum round-trips -----------------------

test("default state form round-trips through datum encoding", () => {
  const form = createDefaultStateForm();
  assert.deepEqual(stateFormFromDatum(stateFormToDatum(form)), form);
});

// The ADA allowance row is entered in ADA and must land on chain as lovelace:
// a "3" typed into the daily limit once serialized as 3 lovelace, which the
// ledger then treated as 0.000003 ₯ and no payout could ever pass.
test("stateFormToDatum scales ADA allowance rows to lovelace", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [
      {
        ...createDefaultUserFormState("1"),
        perDayAllowance: [
          { policyId: "", assetName: "", amount: "3" },
          { policyId: "a".repeat(56), assetName: "", amount: "7" }
        ]
      }
    ]
  };

  const datum = stateFormToDatum(form);
  const sections = readStateSections(datum);
  const user = sections.users[0]! as { fields: unknown[] };
  const perDay = parseValueData(user.fields[2]!, "per_day");

  assert.deepEqual(
    perDay.map((entry) => [entry.policyId, entry.amount.toString()]),
    [
      ["", "3000000"],
      ["a".repeat(56), "7"]
    ]
  );
});

test("stateFormToDatum accepts decimal ADA allowance amounts", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [
      {
        ...createDefaultUserFormState("1"),
        perDayAllowance: [{ policyId: "", assetName: "", amount: "2.777777" }]
      }
    ]
  };

  const sections = readStateSections(stateFormToDatum(form));
  const perDay = parseValueData(
    (sections.users[0]! as { fields: unknown[] }).fields[2]!,
    "per_day"
  );
  assert.equal(perDay[0]!.amount.toString(), "2777777");
  // ...and the decoded form carries the same ADA text back.
  const decoded = stateFormFromDatum(stateFormToDatum(form));
  assert.deepEqual(decoded.users[0]!.perDayAllowance, [
    { policyId: "", assetName: "", amount: "2.777777" }
  ]);
});

test("stateFormToDatum rejects allowance amounts with sub-lovelace precision", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [
      {
        ...createDefaultUserFormState("1"),
        perDayAllowance: [{ policyId: "", assetName: "", amount: "0.0000001" }]
      }
    ]
  };

  assert.throws(() => stateFormToDatum(form), /must be zero or greater/);
});

test("stateFormFromDatum decodes allowance lovelace back into ADA text", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [
      {
        ...createDefaultUserFormState("1"),
        perDayAllowance: [{ policyId: "", assetName: "", amount: "9.5" }]
      }
    ]
  };

  const decoded = stateFormFromDatum(stateFormToDatum(form));
  assert.deepEqual(decoded.users[0]!.perDayAllowance, [
    { policyId: "", assetName: "", amount: "9.5" }
  ]);
});

test("a populated state form round-trips losslessly", () => {
  const adminUser: UserFormState = {
    id: "0",
    wallets: ["aa"],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "0",
    canRenewProofOfLife: true,
    multiSigPowerMode: "none",
    multiSigPower: "",
    isAdmin: true,
    preset: "admin"
  };
  const customUser: UserFormState = {
    id: "1",
    wallets: ["bb"],
    perDayAllowance: [{ policyId: "", assetName: "", amount: "5" }],
    remainingAllowance: [],
    nextAllowanceReset: "100",
    canRenewProofOfLife: true,
    multiSigPowerMode: "some",
    multiSigPower: "2",
    isAdmin: false,
    preset: "custom"
  };
  const form: StateFormState = {
    walletName: "Treasury",
    users: [adminUser, customUser],
    multiSigThresholdMode: "some",
    multiSigThreshold: "2",
    beneficiaries: [
      { id: "0", wallets: ["cc"], unlockAfterMode: "some", unlockAfter: "123", weight: "3" }
    ],
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "9999",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "60",
    streamingPayments: [],
    intendedStakeCredential: INTENDED_STAKE_CREDENTIAL_NONE,
    lastNonAdminPayoutAt: LAST_NON_ADMIN_PAYOUT_AT_NONE
  };

  assert.deepEqual(stateFormFromDatum(stateFormToDatum(form)), form);
});

test("stateFormToDatum produces a 6-field State constructor", () => {
  const datum = stateFormToDatum(createDefaultStateForm());
  assert.equal(datum.alternative, 0);
  // access, proof_of_life, streaming_payments, wallet_name,
  // intended_stake_credential, last_non_admin_payout_at
  assert.equal(datum.fields.length, 6);
});

// --- stateFormToDatum validation throws -------------------------------------

test("stateFormToDatum rejects a non-integer user id", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [{ ...createDefaultUserFormState("abc") }]
  };
  assert.throws(() => stateFormToDatum(form), /User 1 id needs a whole number/);
});

test("stateFormToDatum rejects a beneficiary weight below 1", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    beneficiaries: [
      { id: "0", wallets: [], unlockAfterMode: "none", unlockAfter: "", weight: "0" }
    ]
  };
  assert.throws(() => stateFormToDatum(form), /weight must be at least 1/);
});

test("stateFormToDatum rejects a proof-of-life increment below 1", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "1000",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "0"
  };

  assert.throws(() => stateFormToDatum(form), /Proof-of-life increment must be at least 1/);
});

test("stateFormToDatum rejects a negative allowance amount", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [
      {
        ...createDefaultUserFormState("0"),
        perDayAllowance: [{ policyId: "", assetName: "", amount: "-5" }]
      }
    ]
  };
  assert.throws(() => stateFormToDatum(form), /must be zero or greater/);
});

test("stateFormToDatum rejects a streaming payment with a half-specified asset", () => {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    streamingPayments: [
      {
        id: "0",
        payoutAddress: "addr_test1xyz",
        paidOutAmount: "0",
        policyId: "",
        assetName: "01",
        amountPerDay: "0",
        startDate: "0",
        endDate: "0"
      }
    ]
  };
  assert.throws(() => stateFormToDatum(form), /policy id must be a 28-byte hexadecimal hash/);
});

// --- stateFormFromDatum fallbacks -------------------------------------------

test("stateFormFromDatum falls back to the default form for malformed datums", () => {
  assert.deepEqual(stateFormFromDatum({ alternative: 1, fields: [] }), createDefaultStateForm());
});

test("stateFormFromDatum decodes the canonical default state datum from null", () => {
  const fromNull = stateFormFromDatum(null);
  assert.equal(fromNull.walletName, "Smart wallet");
  assert.deepEqual(fromNull.users, []);
  assert.deepEqual(fromNull.streamingPayments, []);
});
