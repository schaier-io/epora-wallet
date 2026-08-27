import assert from "node:assert/strict";
import test from "node:test";

import { describeStateValidationError } from "@/components/user/workspace/helpers/state-validation-copy";

/**
 * The finding's own example (D10b): the highest-priority sentence on the surface opened with
 * a datum path.
 */
test("rewrites the datum path the review rail was showing", () => {
  const actual = describeStateValidationError(
    "state.beneficiaries[0].beneficiary_wallets must list at least one wallet — a recovery contact with no key can never recover, and their share of the pool would be permanently locked."
  );

  assert.equal(
    actual,
    "Recovery contact 1's wallet IDs must list at least one wallet — a recovery contact with no key can never recover, and their share of the pool would be permanently locked."
  );
});

test("counts from one, not from zero", () => {
  assert.equal(
    describeStateValidationError("state.users[2].per_day_allowance must be >= 0."),
    "Person 3's daily limit must be >= 0."
  );
});

test("rewrites every path in a sentence, not just the first", () => {
  assert.equal(
    describeStateValidationError(
      "state.beneficiaries[0] and state.beneficiaries[1] must not share beneficiary wallets."
    ),
    "Recovery contact 1 and recovery contact 2 must not share wallet IDs."
  );
});

test("keeps the Option wrapper out of the sentence", () => {
  assert.equal(
    describeStateValidationError("state.multi_sig_threshold.Some must be >= 0."),
    "The co-signer threshold must be >= 0."
  );
  assert.equal(
    describeStateValidationError(
      "state.proof_of_life_unlock_time and state.proof_of_life_increment must both be set or both be None."
    ),
    "The proof of life date and the proof of life length must both be set or both be None."
  );
});

test("names the field even when no rule matches it", () => {
  const actual = describeStateValidationError("state.some_future_field[0].inner_part must be a list.");

  assert.equal(actual, "Some future field 1 inner part must be a list.");
  assert.doesNotMatch(actual, /state\./);
});

test("leaves a message with no path alone", () => {
  const message = "Recovery contacts need a proof of life before they can be used.";

  assert.equal(describeStateValidationError(message), message);
});

test("never lets a dotted datum path through", () => {
  const messages = [
    "state.wallet_name must be a byte-array string.",
    "state.users[0].user_wallets[1] must be a 28-byte Cardano credential hash (56 hexadecimal characters).",
    "state.users contains duplicate id 4.",
    "state.streamingPayments[1].end_date must be an integer.",
    "state.intended_stake_credential must be None or Some with a 28-byte Cardano credential hash.",
    "state.last_non_admin_payout_at must be an Option constructor."
  ];

  for (const message of messages) {
    assert.doesNotMatch(describeStateValidationError(message), /\bstate\./, message);
  }
});
