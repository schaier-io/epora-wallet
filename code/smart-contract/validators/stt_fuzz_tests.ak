//// Validator-level property tests for the STT `spend` entry point. Each test
//// fuzzes ONE adversarial dimension of an otherwise well-formed STT transition
//// and asserts `stt.eval_spend`'s response over the whole input space —
//// complementing the hand-picked cases in the other `stt_*_tests.ak` files.
////
//// `fail` properties assert REJECTION for every generated case (rejection here
//// happens via `expect`, which errors — exactly what `fail` accepts); the lone
//// non-`fail` property asserts a valid transition is accepted across a fuzzed
//// range. These drive the `pub` `stt.eval_spend` body, so they live in this
//// `_tests.ak` sibling rather than inline in the validator (tests never live in
//// logic files).

use aiken/fuzz
use aiken/interval
use cardano/assets
use cardano/fuzz as cardano_fuzz
use state/types as state_types
use stt
use test_support/fuzz_generators as gen
use test_support/security_fixtures as fixtures
use test_support/stt_test_helpers.{admin_state, spend_transaction}

// Only the dedicated `SetIntendedStakeCredential` action may change where wallet
// funds delegate. Any OTHER action that retargets `intended_stake_credential` is
// rejected by the central preservation gate in `eval_spend`, fuzzed here over an
// arbitrary credential (an admin operator-Use that tries to smuggle the change).
test prop_stt_non_set_action_cannot_retarget_intended_stake(
  rogue_credential via cardano_fuzz.credential(),
) fail {
  let input_state = admin_state()
  let output_state = state_types.State {
    ..input_state,
    intended_stake_credential: Some(rogue_credential),
    last_permissionless_payout_at: None,
  }
  let tx = spend_transaction(
    interval.between(50, 100),
    ["admin"],
    input_state,
    output_state,
    fixtures.default_stt_value(),
    fixtures.default_stt_value(),
    [],
    #"5f31000000000000000000000000000000000000000000000000000000000000",
  )
  stt.eval_spend(
    None,
    fixtures.operator_use_action(state_types.Admin),
    fixtures.stt_input_ref(),
    tx,
  )
}

// The permissionless `PayStreamingPayment` crank must make real progress: an
// unchanged streaming-payment set is rejected (anti-stall, audit F-1). Fuzzed
// over arbitrary payment lists — including the empty list — with input == output.
test prop_stt_payout_rejects_unchanged_streaming_payments(
  payments via gen.streaming_payment_list(),
) fail {
  let state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    payments,
  )
  let tx = spend_transaction(
    interval.between(50, 100),
    ["admin"],
    state,
    state,
    fixtures.default_stt_value(),
    fixtures.default_stt_value(),
    [],
    #"5f32000000000000000000000000000000000000000000000000000000000000",
  )
  stt.eval_spend(
    None,
    fixtures.streaming_payment_action([]),
    fixtures.stt_input_ref(),
    tx,
  )
}

// Operator authority cannot be forged by random signatories: an admin-path
// operator-Use with any signatory set that omits the admin key is rejected.
// Fuzzed over the signatory-list space (including the empty list).
test prop_stt_operator_use_rejects_without_admin_signature(
  signatories via gen.signatories_excluding("admin"),
) fail {
  let state = admin_state()
  let tx = spend_transaction(
    interval.between(50, 100),
    signatories,
    state,
    state,
    fixtures.default_stt_value(),
    fixtures.default_stt_value(),
    [],
    #"5f33000000000000000000000000000000000000000000000000000000000000",
  )
  stt.eval_spend(
    None,
    fixtures.operator_use_action(state_types.Admin),
    fixtures.stt_input_ref(),
    tx,
  )
}

// Consolidation must leave the State completely unchanged. Any mutation — here a
// fuzzed non-empty wallet name — is rejected, fuzzed over the byte-string space.
test prop_stt_consolidate_rejects_state_mutation(
  new_name via fuzz.bytearray_between(1, 16),
) fail {
  let input_state = admin_state()
  let output_state = state_types.State { ..input_state, wallet_name: new_name }
  let tx = spend_transaction(
    interval.between(50, 100),
    ["admin"],
    input_state,
    output_state,
    fixtures.default_stt_value(),
    fixtures.default_stt_value(),
    [],
    #"5f34000000000000000000000000000000000000000000000000000000000000",
  )
  stt.eval_spend(
    None,
    fixtures.consolidation_action(state_types.AdminPath),
    fixtures.stt_input_ref(),
    tx,
  )
}

// Positive: an admin operator-Use that only tops up the STT output's lovelace is
// accepted for any non-negative top-up (admin is trusted to reshape the STT
// UTxO's own value). No valid admin Use is wrongly rejected across the range.
test prop_stt_admin_use_accepts_lovelace_topup(
  extra_lovelace via fuzz.int_at_least(0),
) {
  let state = admin_state()
  let input_value = fixtures.default_stt_value()
  let output_value = assets.merge(
    input_value,
    assets.from_lovelace(extra_lovelace),
  )
  let tx = spend_transaction(
    interval.between(50, 100),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"5f35000000000000000000000000000000000000000000000000000000000000",
  )
  stt.eval_spend(
    None,
    fixtures.operator_use_action(state_types.Admin),
    fixtures.stt_input_ref(),
    tx,
  )
}
