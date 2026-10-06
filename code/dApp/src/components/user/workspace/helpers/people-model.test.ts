import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDefaultBeneficiaryFormState,
  createDefaultStateForm,
  createDefaultUserFormState,
  type StateFormState,
  type UserFormState
} from "@/lib/contracts/state-form";
import {
  approvalThreshold,
  coSignerSegments,
  groupPeople,
  personKeyForContact,
  personPermissions,
  withPersonUserEdited,
  personTag,
  personWallets,
  thresholdIsUnreachable,
  withOwnerToggled,
  withoutRecoveryContact,
  withPersonRemoved,
  withRecoveryContactForUser,
  withUserForContact
} from "./people-model";

const KEY_A = "a".repeat(56);
const KEY_B = "b".repeat(56);
const KEY_C = "c".repeat(56);

function user(id: string, wallets: string[], patch: Partial<UserFormState> = {}): UserFormState {
  return { ...createDefaultUserFormState(id), wallets, ...patch };
}

function contact(id: string, wallets: string[]) {
  return { ...createDefaultBeneficiaryFormState(id), wallets };
}

function form(patch: Partial<StateFormState>): StateFormState {
  return { ...createDefaultStateForm(), users: [], beneficiaries: [], ...patch };
}

test("a user and a recovery contact with the same wallet are one person", () => {
  const people = groupPeople(
    form({
      users: [user("0", [KEY_A]), user("1", [KEY_B])],
      beneficiaries: [contact("0", [KEY_B.toUpperCase()]), contact("1", [KEY_C])]
    })
  );
  assert.deepEqual(people, [
    { key: "user-0", userIndex: 0, beneficiaryIndex: null },
    { key: "user-1", userIndex: 1, beneficiaryIndex: 0 },
    { key: "contact-1", userIndex: null, beneficiaryIndex: 1 }
  ]);
});

test("a recovery contact joins only the first user who shares its wallet", () => {
  const people = groupPeople(
    form({
      users: [user("0", [KEY_A]), user("1", [KEY_A])],
      beneficiaries: [contact("0", [KEY_A])]
    })
  );
  assert.deepEqual(
    people.map((person) => person.beneficiaryIndex),
    [0, null]
  );
});

test("permissions read the records behind a row, and owners never hold check-in", () => {
  const value = form({
    users: [
      user("0", [KEY_A], { isAdmin: true, canRenewProofOfLife: true }),
      user("1", [KEY_B], {
        multiSigPowerMode: "some",
        multiSigPower: "2",
        canRenewProofOfLife: true,
        perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }]
      })
    ],
    beneficiaries: [contact("0", [KEY_B])]
  });
  const [owner, member] = groupPeople(value);
  assert.deepEqual(personPermissions(value, owner), {
    owner: true,
    coSigner: false,
    spender: false,
    checkIn: false,
    recoveryContact: false
  });
  assert.deepEqual(personPermissions(value, member), {
    owner: false,
    coSigner: true,
    spender: true,
    checkIn: true,
    recoveryContact: true
  });
  assert.deepEqual(personWallets(value, member), [KEY_B]);
});

test("turning owner on clears approval power and limits, turning it off keeps the rest", () => {
  const coSigner = user("0", [KEY_A], {
    multiSigPowerMode: "some",
    multiSigPower: "3",
    perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
    remainingAllowance: [{ policyId: "", assetName: "", amount: "5" }]
  });
  const owner = withOwnerToggled(coSigner, true);
  assert.equal(owner.isAdmin, true);
  assert.equal(owner.multiSigPowerMode, "none");
  assert.deepEqual(owner.perDayAllowance, []);
  assert.deepEqual(owner.remainingAllowance, []);
  assert.deepEqual(owner.wallets, [KEY_A]);
  const member = withOwnerToggled(owner, false);
  assert.equal(member.isAdmin, false);
  assert.equal(member.canRenewProofOfLife, false);
  assert.deepEqual(member.wallets, [KEY_A]);
});

test("recovery on for a user adds a contact on the same wallet and starts the proof of life", () => {
  const value = form({ users: [user("0", [KEY_A], { canRenewProofOfLife: true })] });
  const next = withRecoveryContactForUser(value, 0, 1_000);
  assert.equal(next.beneficiaries.length, 1);
  assert.deepEqual(next.beneficiaries[0].wallets, [KEY_A]);
  assert.equal(next.beneficiaries[0].payoutAddress, "");
  assert.equal(next.proofOfLifeUnlockTimeMode, "some");
  assert.equal(next.proofOfLifeIncrementMode, "some");
  assert.deepEqual(groupPeople(next)[0], { key: "user-0", userIndex: 0, beneficiaryIndex: 0 });

  const off = withoutRecoveryContact(next, 0);
  assert.equal(off.beneficiaries.length, 0);
  assert.equal(off.users.length, 1);
});

test("a user permission on a contact-only person adds a user on the contact's wallet", () => {
  const value = form({ beneficiaries: [contact("0", [KEY_C])] });
  const next = withUserForContact(value, 0, (created) => ({
    ...created,
    multiSigPowerMode: "some",
    multiSigPower: "1"
  }));
  assert.deepEqual(next.users[0].wallets, [KEY_C]);
  // The first co-signer turns the approval rule on.
  assert.equal(next.multiSigThresholdMode, "some");
  assert.equal(next.multiSigThreshold, "1");
  assert.deepEqual(groupPeople(next), [
    { key: "user-0", userIndex: 0, beneficiaryIndex: 0 }
  ]);
});

test("removing a person removes both records and recomputes the approval rule", () => {
  const value = form({
    users: [user("0", [KEY_A], { multiSigPowerMode: "some", multiSigPower: "1" })],
    beneficiaries: [contact("0", [KEY_A])],
    multiSigThresholdMode: "some",
    multiSigThreshold: "1"
  });
  const next = withPersonRemoved(value, groupPeople(value)[0]);
  assert.equal(next.users.length, 0);
  assert.equal(next.beneficiaries.length, 0);
  assert.equal(next.multiSigThresholdMode, "none");
});

test("segments count only co-signers with power and a wallet to sign with", () => {
  const value = form({
    users: [
      user("0", [KEY_A], { multiSigPowerMode: "some", multiSigPower: "2" }),
      user("1", [], { multiSigPowerMode: "some", multiSigPower: "5" }),
      user("2", [KEY_B], { multiSigPowerMode: "some", multiSigPower: "1" }),
      user("3", [KEY_C], { multiSigPowerMode: "none", multiSigPower: "4" })
    ]
  });
  assert.deepEqual(coSignerSegments(value), [
    { userIndex: 0, userId: "0", power: 2 },
    { userIndex: 2, userId: "2", power: 1 }
  ]);
});

test("a threshold above the reachable power is unreachable", () => {
  const value = form({
    users: [user("0", [KEY_A], { multiSigPowerMode: "some", multiSigPower: "2" })],
    multiSigThresholdMode: "some",
    multiSigThreshold: "2"
  });
  assert.equal(approvalThreshold(value), 2);
  assert.equal(thresholdIsUnreachable(value), false);
  assert.equal(thresholdIsUnreachable({ ...value, multiSigThreshold: "3" }), true);
  assert.equal(approvalThreshold({ ...value, multiSigThresholdMode: "none" }), null);
  assert.equal(thresholdIsUnreachable({ ...value, multiSigThreshold: "" }), false);
});

test("recovery on takes the first wallet that is filled in", () => {
  const next = withRecoveryContactForUser(form({ users: [user("0", ["", KEY_A], { canRenewProofOfLife: true })] }), 0, 1_000);
  assert.deepEqual(next.beneficiaries[0].wallets, [KEY_A]);
  assert.equal(groupPeople(next).length, 1);
});

test("a person's tag is the start of their first wallet, or their record number", () => {
  assert.equal(personTag({ id: "3", wallets: [" ", KEY_A] }), "aaaaaa");
  assert.equal(personTag({ id: "3", wallets: [] }), "#3");
});

test("recovery on for a user who grants nothing replaces the empty user record", () => {
  const value = form({ users: [user("0", [KEY_A])] });
  const next = withRecoveryContactForUser(value, 0, 1_000);
  assert.equal(next.users.length, 0);
  assert.deepEqual(next.beneficiaries[0].wallets, [KEY_A]);
  assert.equal(personKeyForContact(next, next.beneficiaries[0].id), "contact-0");
});

test("taking the last user permission from a recovery contact keeps only the contact", () => {
  const value = form({
    users: [user("0", [KEY_A], { multiSigPowerMode: "some", multiSigPower: "1" })],
    beneficiaries: [contact("0", [KEY_A])],
    multiSigThresholdMode: "some",
    multiSigThreshold: "1"
  });
  const person = groupPeople(value)[0];
  const next = withPersonUserEdited(value, person, (edited) => ({ ...edited, multiSigPowerMode: "none" }));
  assert.equal(next.users.length, 0);
  assert.equal(next.beneficiaries.length, 1);
  assert.equal(next.multiSigThresholdMode, "none");
  assert.equal(personKeyForContact(next, "0"), "contact-0");

  const kept = withPersonUserEdited(
    { ...value, beneficiaries: [] },
    { key: "user-0", userIndex: 0, beneficiaryIndex: null },
    (edited) => ({ ...edited, multiSigPowerMode: "none" })
  );
  assert.equal(kept.users.length, 1);
});

test("a user edit on a contact-only person creates the user record", () => {
  const value = form({ beneficiaries: [contact("0", [KEY_C])] });
  const next = withPersonUserEdited(value, groupPeople(value)[0], (edited) =>
    withOwnerToggled(edited, true)
  );
  assert.equal(next.users[0].isAdmin, true);
  assert.deepEqual(next.users[0].wallets, [KEY_C]);
});

test("a contact without a payout key follows the person's wallet when it changes", () => {
  const value = form({ users: [user("0", [KEY_A], { canRenewProofOfLife: true })], beneficiaries: [contact("0", [KEY_A])] });
  const [person] = groupPeople(value);
  const next = withPersonUserEdited(value, person, (edited) => ({ ...edited, wallets: [KEY_B] }));
  assert.deepEqual(next.beneficiaries[0].wallets, [KEY_B]);
  assert.equal(groupPeople(next).length, 1);
});

test("a user record with wallets beyond the contact's stays when its last permission goes", () => {
  const value = form({ users: [user("0", [KEY_A, KEY_B], { isAdmin: true })], beneficiaries: [contact("0", [KEY_A])] });
  const [person] = groupPeople(value);
  const next = withPersonUserEdited(value, person, (edited) => withOwnerToggled(edited, false));
  assert.deepEqual(next.users.map((entry) => entry.wallets), [[KEY_A, KEY_B]]);
});

