//// STT beneficiary-use transition tests: UseBeneficiary (the one-shot
//// recovery draw and its unlock-authority / single-actor guards).

use aiken/interval
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures

fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

test beneficiary_use_accepts_unlocked_beneficiary() {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  // UseBeneficiary removes the acting beneficiary from the forwarded state.
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      ..input_state.access,
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    #"2530000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

test beneficiary_use_rejects_ambiguous_beneficiary_authority() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [
      fixtures.default_beneficiary(7, "beneficiary1", Some(100)),
      fixtures.default_beneficiary(8, "beneficiary2", Some(100)),
    ],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1", "beneficiary2"],
    input_state,
    input_state,
    [],
    #"2630000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

test beneficiary_use_rejects_locked_shared_wallet_overlap() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "shared")],
    [fixtures.default_beneficiary(7, "shared", Some(200))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["shared"],
    input_state,
    input_state,
    [],
    #"2730000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

// Audit L3. The "one withdrawal each" beneficiary cap relies on
// `eval_use_beneficiary` removing the acting beneficiary in the same transition
// (`state_unchanged_except_beneficiary_removed`). This is the exact transition
// `beneficiary_use_accepts_unlocked_beneficiary` accepts, except the output
// RETAINS the acting beneficiary (output == input). It must be rejected;
// otherwise a beneficiary could withdraw its weighted share repeatedly across
// transactions instead of one-shot.
test beneficiary_use_rejects_retained_acting_beneficiary() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    input_state,
    [],
    #"3630000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}
