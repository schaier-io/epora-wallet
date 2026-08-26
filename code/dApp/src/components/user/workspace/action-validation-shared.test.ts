import { test } from "node:test";
import assert from "node:assert/strict";
import { type FieldErrors } from "@/components/user/flow-types";
import {
  requireStakingEnabled,
  requireZeroAdminConfirmation,
  validateSpecificWakeUpDate,
  validateGovernanceVotePayload,
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

test("requireZeroAdminConfirmation flags a wallet left with no owner", () => {
  const errors: FieldErrors = {};
  requireZeroAdminConfirmation(errors, stateFormWithAdmins(0), false);
  // The message must not name an internal action id, and no button says "Build".
  assert.equal(
    errors["Wallet with no owner"]?.[0],
    "Confirm that this wallet will have no owner before you continue."
  );
});

test("requireZeroAdminConfirmation passes when confirmed or an owner exists", () => {
  const confirmed: FieldErrors = {};
  requireZeroAdminConfirmation(confirmed, stateFormWithAdmins(0), true);
  assert.deepEqual(confirmed, {});

  const hasAdmins: FieldErrors = {};
  requireZeroAdminConfirmation(hasAdmins, stateFormWithAdmins(1), false);
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

/**
 * Mesh's `VoteType` (`@meshsdk/common` `index.d.ts:1607-1626`) is
 * `{voter, govActionId, votingProcedure: {voteKind: "Yes"|"No"|"Abstain"}}`. Its serializer
 * reports nothing when a part is missing: `toCardanoVoter`
 * (`@meshsdk/core-cst` `index.js:73793`) is a switch with no default branch, and
 * `addBasicVote` (`:75203`) reads `govActionId.txHash` unguarded.
 */
const VALID_VOTE = JSON.stringify({
  voter: { type: "DRep", drepId: "drep1abc" },
  govActionId: { txHash: "aa".repeat(32), txIndex: 0 },
  votingProcedure: { voteKind: "Yes" }
});

test("validateGovernanceVotePayload rejects the empty default the form ships with", () => {
  const errors: FieldErrors = {};
  validateGovernanceVotePayload(errors, "{}");
  assert.equal(
    errors["Vote JSON"]?.[0],
    "A vote has to say who is voting, which proposal, and how you vote."
  );
});

test("validateGovernanceVotePayload rejects a vote missing any one of the three parts", () => {
  for (const dropped of ["voter", "govActionId", "votingProcedure"]) {
    const vote = JSON.parse(VALID_VOTE) as Record<string, unknown>;
    delete vote[dropped];
    const errors: FieldErrors = {};
    validateGovernanceVotePayload(errors, JSON.stringify(vote));
    assert.ok(errors["Vote JSON"], `expected an error when ${dropped} is missing`);
  }
});

test("validateGovernanceVotePayload names the three answers a vote may carry", () => {
  for (const voteKind of ["Yes", "No", "Abstain"]) {
    const errors: FieldErrors = {};
    validateGovernanceVotePayload(
      errors,
      JSON.stringify({ ...JSON.parse(VALID_VOTE), votingProcedure: { voteKind } })
    );
    assert.deepEqual(errors, {}, `${voteKind} should be accepted`);
  }

  const rejected: FieldErrors = {};
  validateGovernanceVotePayload(
    rejected,
    JSON.stringify({ ...JSON.parse(VALID_VOTE), votingProcedure: { voteKind: "Maybe" } })
  );
  assert.equal(rejected["Vote JSON"]?.[0], "The vote has to be Yes, No or Abstain.");
});

test("validateGovernanceVotePayload accepts a whole vote and leaves unparseable JSON alone", () => {
  const valid: FieldErrors = {};
  validateGovernanceVotePayload(valid, VALID_VOTE);
  assert.deepEqual(valid, {});

  // The caller's own try/catch already reports this under the "Vote" key, so a second
  // message here would put two errors under one box.
  const broken: FieldErrors = {};
  validateGovernanceVotePayload(broken, "{not json");
  assert.deepEqual(broken, {});
});

test("validateGovernanceVotePayload rejects a JSON array, which parses but is not a vote", () => {
  const errors: FieldErrors = {};
  validateGovernanceVotePayload(errors, "[]");
  assert.ok(errors["Vote JSON"]);
});
