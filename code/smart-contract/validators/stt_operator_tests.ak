//// STT operator-driven action tests: RunOperator(Use / UpdateState /
//// ManageStreamingPayments) and RenewProofOfLife.

use aiken/interval
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/intent_fixtures as intent
use test_support/security_fixtures as fixtures

// The one eval entry point for this file: the datum (None) and STT input ref
// are fixture-bound, so each test states only its action and transaction.
// Binding fixture args is partial application, not a pure-forwarding wrapper
// (contracts CLAUDE.md §4).
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

test operator_use_admin_path_accepts_admin_signature() {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [],
  )
  let output_state = intent.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1130000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Admin, state_types.Use),
      transaction,
    )
}

test operator_use_multisig_path_accepts_required_power() {
  let input_state = fixtures.secured_state(
    [fixtures.multisig_user(1, "ms1", 2), fixtures.multisig_user(2, "ms2", 1)],
    [],
    [],
  )
  let output_state = intent.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["ms1"],
    input_state,
    output_state,
    [],
    #"1230000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Multisig, state_types.Use),
      transaction,
    )
}

test operator_use_rejects_missing_authority() fail {
  let input_state = fixtures.secured_state(
    [fixtures.multisig_user(1, "ms1", 2), fixtures.multisig_user(2, "ms2", 1)],
    [],
    [],
  )
  let output_state = intent.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    [],
    input_state,
    output_state,
    [],
    #"1330000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Multisig, state_types.Use),
      transaction,
    )
}

test operator_state_update_accepts_valid_admin_rewrite() {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [],
  )
  let output_state = fixtures.secured_state(
    [fixtures.admin_user("admin"), fixtures.renewing_user(1, "renewer")],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_accepts_admin_wallet_name_change() {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [],
  )
  let output_state = state_types.State { ..input_state, wallet_name: #"0102" }
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1540000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_rejects_multisig_wallet_name_change() fail {
  let input_state = fixtures.secured_state(
    [fixtures.multisig_user(1, "multisig", 2)],
    [],
    [],
  )
  let output_state = state_types.State { ..input_state, wallet_name: #"0102" }
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["multisig"],
    input_state,
    output_state,
    [],
    #"1541000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Multisig, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_rejects_streaming_payment_edit() fail {
  let streaming_payment = intent.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    200_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [intent.ada_streaming_payment_ending(1, "beneficiary1", 0, 250_000)],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1530000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_rejects_invalid_output_configuration() fail {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [],
  )
  let output_state = fixtures.state(
    [fixtures.renewing_user(1, "renewer")],
    None,
    [],
    None,
    None,
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1630000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test manage_streaming_payments_accepts_extension() {
  let streaming_payment = intent.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..intent.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, "beneficiary1", 0, 200_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test manage_streaming_payments_rejects_shortening_before_tx_lower_bound() fail {
  let streaming_payment = intent.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..intent.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, "beneficiary1", 0, 100),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1830000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test manage_streaming_payments_rejects_shortening_within_validity_window() fail {
  let streaming_payment = intent.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..intent.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, "beneficiary1", 0, 115),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1930000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

// An admin may ADD a new streaming payment to a live wallet (born unsettled)
// while preserving the existing one. This is the post-mint add path.
test manage_streaming_payments_accepts_adding_new_streaming_payment() {
  let existing_streaming_payment = intent.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [existing_streaming_payment],
  )
  let output_state = state_types.State {
    ..intent.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      existing_streaming_payment,
      intent.ada_streaming_payment_ending(2, "beneficiary2", 0, 200_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

// A newly added streaming payment cannot be born already-settled: a non-zero
// paid_out on the fresh entry is rejected even with valid admin authority.
test manage_streaming_payments_rejects_adding_prepaid_streaming_payment() fail {
  let existing_streaming_payment = intent.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [existing_streaming_payment],
  )
  let output_state = state_types.State {
    ..intent.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      existing_streaming_payment,
      intent.ada_streaming_payment_ending(2, "beneficiary2", 5, 200_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    intent.tx_id(#"1a31"),
  )

  expect
    run_stt_spend(
      intent.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test manage_streaming_payments_rejects_access_control_mutation() fail {
  let streaming_payment = intent.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = fixtures.secured_state(
    [fixtures.admin_user("admin"), fixtures.renewing_user(1, "renewer")],
    [],
    [intent.ada_streaming_payment_ending(1, "beneficiary1", 0, 200_000)],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1931000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      intent.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test renew_proof_of_life_rejects_admin_signer() fail {
  let state_input = fixtures.secured_state(
    [
      state_types.User {
        ..fixtures.admin_user("admin"),
        can_renew_proof_of_life: True,
      },
    ],
    [],
    [],
  )
  let state_output = intent.with_renewed_proof_of_life(state_input, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    state_input,
    state_output,
    [],
    #"2030000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_stt_spend(state_types.RenewProofOfLife, transaction)
}
