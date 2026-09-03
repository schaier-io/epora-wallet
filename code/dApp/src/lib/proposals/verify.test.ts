import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStateForm, type UserFormState } from "@/lib/contracts/state-form";
import {
  computeSignerSatisfaction,
  decodeRequiredSigners,
  determineProposalValidity,
  isProposalExpired
} from "@/lib/proposals/verify";

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

test("a multisig threshold of zero never passes, as on-chain", () => {
  const form = multisigForm();
  form.multiSigThreshold = "0";
  assert.equal(computeSignerSatisfaction(form, "multisig", ["w1"]).satisfied, false);
  assert.equal(computeSignerSatisfaction(form, "multisig", ["w1"], ["w1"]).satisfied, false);
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

test("proposal verification fails closed when any security check is unresolved", () => {
  const verified = {
    bodyHashMatches: true,
    transactionDecoded: true,
    inputsFullyChecked: true,
    allInputsLive: true,
    stateInputBound: true,
    signerStateResolved: true,
    signaturesValid: true,
    notExpired: true,
    listedSignersCanPass: true
  };

  assert.equal(determineProposalValidity(verified), "valid");
  for (const check of Object.keys(verified) as (keyof typeof verified)[]) {
    assert.equal(
      determineProposalValidity({ ...verified, [check]: false }),
      "invalid",
      `${check} must fail closed`
    );
  }
});

test("a body with no upper validity bound never expires", () => {
  assert.equal(isProposalExpired(null, Number.MAX_SAFE_INTEGER), false);
});

test("a body expires from the start of its invalid_hereafter slot, not one slot later", () => {
  const validUntilMs = 1_700_000_000_000;
  assert.equal(isProposalExpired(validUntilMs, validUntilMs - 1), false);
  assert.equal(isProposalExpired(validUntilMs, validUntilMs), true);
  assert.equal(isProposalExpired(validUntilMs, validUntilMs + 60_000), true);
});

function multisigForm(): ReturnType<typeof createDefaultStateForm> {
  const form = createDefaultStateForm();
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "3";
  form.users = [
    makeUser({ id: "u1", wallets: ["w1"], multiSigPowerMode: "some", multiSigPower: "2" }),
    makeUser({ id: "u2", wallets: ["w2"], multiSigPowerMode: "some", multiSigPower: "2" }),
    makeUser({ id: "u3", wallets: ["w3"], multiSigPowerMode: "some", multiSigPower: "2" })
  ];
  return form;
}

test("only the keys the body lists count towards the threshold", () => {
  // The validator reads `extra_signatories`, which holds the body's required
  // signers and nothing else, so w3's signature adds no power on-chain.
  const result = computeSignerSatisfaction(multisigForm(), "multisig", ["w1", "w3"], ["w1", "w2"]);
  assert.equal(result.satisfiedPower, 2);
  assert.equal(result.satisfied, false);
  assert.deepEqual(
    result.requiredSigners.map((signer) => signer.keyHash),
    ["w1", "w2"]
  );
});

test("a listed request is satisfied only once every listed key has signed", () => {
  const form = multisigForm();
  form.multiSigThreshold = "2";
  // w1 alone reaches the threshold, but the ledger still wants w2's witness.
  const partial = computeSignerSatisfaction(form, "multisig", ["w1"], ["w1", "w2"]);
  assert.equal(partial.satisfiedPower, 2);
  assert.equal(partial.satisfied, false);
  const complete = computeSignerSatisfaction(form, "multisig", ["w1", "w2"], ["w1", "w2"]);
  assert.equal(complete.satisfied, true);
});

test("a listed key outside the access list must still sign and carries no power", () => {
  const result = computeSignerSatisfaction(multisigForm(), "multisig", ["w1", "w2"], ["w1", "w2", "fee-payer"]);
  assert.equal(result.satisfiedPower, 4);
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.requiredSigners.at(-1), { keyHash: "fee-payer", power: 0, isAdmin: false });
});

test("an admin request lists only the admins named in the body", () => {
  const form = createDefaultStateForm();
  form.users = [
    makeUser({ id: "a", wallets: ["a1"], isAdmin: true }),
    makeUser({ id: "b", wallets: ["b1"], isAdmin: true })
  ];
  const result = computeSignerSatisfaction(form, "admin", ["b1"], ["a1"]);
  assert.deepEqual(result.requiredSigners, [{ keyHash: "a1", power: 1, isAdmin: true }]);
  assert.equal(result.satisfied, false);
  assert.equal(computeSignerSatisfaction(form, "admin", ["a1"], ["a1"]).satisfied, true);
});

// Built with MeshTxBuilder: one input, one output, and `requiredSignerHash` for
// aa…aa and bb…bb. What the validator sees as `extra_signatories`.
const TX_WITH_TWO_REQUIRED_SIGNERS =
  "84a500d9010281825820111111111111111111111111111111111111111111111111111111111111111100018182581d6033c378cee41b2e15ac848f7f6f1d2f78155ab12d93b713de898d855f1a001e84800200075820bdaa99eb158414dea0a91d6c727e2268574b23efe6e08ab3b841abe8059a030c0ed9010282581caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa581cbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba0f5d90103a0";

test("the body's required signers decode to lower-case key hashes", () => {
  assert.deepEqual(decodeRequiredSigners(TX_WITH_TWO_REQUIRED_SIGNERS), [
    "aa".repeat(28),
    "bb".repeat(28)
  ]);
});

test("a body that lists no required signers decodes to an empty list", () => {
  // Same transaction with the `required_signers` entry (key 14) removed.
  const withoutSigners = TX_WITH_TWO_REQUIRED_SIGNERS
    .replace("84a500", "84a400")
    .replace(/0ed9010282581c(aa){28}581c(bb){28}/, "");
  assert.deepEqual(decodeRequiredSigners(withoutSigners), []);
  assert.deepEqual(decodeRequiredSigners("not cbor"), []);
});
