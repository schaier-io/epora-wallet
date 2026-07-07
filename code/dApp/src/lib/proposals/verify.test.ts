import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStateForm, type UserFormState } from "@/lib/contracts/state-form";
import { computeSignerSatisfaction } from "@/lib/proposals/verify";

function makeUser(overrides: Partial<UserFormState>): UserFormState {
  return {
    id: "user",
    wallets: [],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "",
    canRenewProofOfLife: false,
    multiSigPowerMode: "none",
    multiSigPower: "",
    isAdmin: false,
    preset: "custom",
    ...overrides
  };
}

test("admin path is satisfied when an admin's wallet has signed", () => {
  const form = createDefaultStateForm();
  form.users = [makeUser({ id: "a", wallets: ["a1"], isAdmin: true })];
  const result = computeSignerSatisfaction(form, "admin", ["a1"]);
  assert.equal(result.satisfied, true);
  assert.equal(result.satisfiedPower, 1);
  assert.equal(result.threshold, null);
  assert.deepEqual(result.requiredSigners, [{ keyHash: "a1", power: 1, isAdmin: true }]);
});

test("admin path is not satisfied when no admin has signed", () => {
  const form = createDefaultStateForm();
  form.users = [makeUser({ wallets: ["a1"], isAdmin: true })];
  const result = computeSignerSatisfaction(form, "admin", ["z9"]);
  assert.equal(result.satisfied, false);
  assert.equal(result.satisfiedPower, 0);
});

test("admin path matches signer key hashes case-insensitively", () => {
  const form = createDefaultStateForm();
  form.users = [makeUser({ wallets: ["AbC123"], isAdmin: true })];
  const result = computeSignerSatisfaction(form, "admin", ["abc123"]);
  assert.equal(result.satisfied, true);
});

test("multisig path sums power across distinct signing users and meets the threshold", () => {
  const form = createDefaultStateForm();
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "3";
  form.users = [
    makeUser({ id: "u1", wallets: ["w1"], multiSigPowerMode: "some", multiSigPower: "2" }),
    makeUser({ id: "u2", wallets: ["w2"], multiSigPowerMode: "some", multiSigPower: "2" })
  ];
  const result = computeSignerSatisfaction(form, "multisig", ["w1", "w2"]);
  assert.equal(result.threshold, 3);
  assert.equal(result.satisfiedPower, 4);
  assert.equal(result.satisfied, true);
});

test("multisig power is counted once per user record even with multiple signed wallets", () => {
  const form = createDefaultStateForm();
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "3";
  form.users = [
    makeUser({ id: "u1", wallets: ["w1", "w2"], multiSigPowerMode: "some", multiSigPower: "3" })
  ];
  // Both of the user's wallets signed, but the record's power counts once.
  const result = computeSignerSatisfaction(form, "multisig", ["w1", "w2"]);
  assert.equal(result.satisfiedPower, 3);
  assert.equal(result.satisfied, true);
});

test("multisig path is not satisfied below the threshold", () => {
  const form = createDefaultStateForm();
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "2";
  form.users = [
    makeUser({ id: "u1", wallets: ["w1"], multiSigPowerMode: "some", multiSigPower: "1" })
  ];
  const result = computeSignerSatisfaction(form, "multisig", ["w1"]);
  assert.equal(result.satisfiedPower, 1);
  assert.equal(result.satisfied, false);
});

test("multisig path with no threshold is never satisfied", () => {
  const form = createDefaultStateForm();
  form.multiSigThresholdMode = "none";
  form.users = [
    makeUser({ id: "u1", wallets: ["w1"], multiSigPowerMode: "some", multiSigPower: "5" })
  ];
  const result = computeSignerSatisfaction(form, "multisig", ["w1"]);
  assert.equal(result.threshold, null);
  assert.equal(result.satisfied, false);
});

test("multisig required signers exclude users without voting power", () => {
  const form = createDefaultStateForm();
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "1";
  form.users = [
    makeUser({ id: "u1", wallets: ["w1"], multiSigPowerMode: "some", multiSigPower: "1" }),
    makeUser({ id: "u2", wallets: ["w2"], multiSigPowerMode: "none", multiSigPower: "" })
  ];
  const result = computeSignerSatisfaction(form, "multisig", []);
  assert.equal(result.requiredSigners.length, 1);
  assert.equal(result.requiredSigners[0]!.keyHash, "w1");
});
