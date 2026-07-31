//// STT operator-driven action tests: RunOperator(Use / UpdateState /
//// ManageStreamingPayments) and RenewProofOfLife.

use aiken/interval
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

// The one eval entry point for this file: the datum (None) and STT input ref
// are fixture-bound, so each test states only its action and transaction.
// Binding fixture args is partial application, not a pure-forwarding wrapper
// (contracts CLAUDE.md §4).
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

test operator_use_admin_path_accepts_admin_signature() {
  let input_state = states.secured_state([states.admin_user("admin")], [], [])
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1130"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.Use),
      transaction,
    )
}

test operator_use_multisig_path_accepts_required_power() {
  let input_state = states.secured_state(
    [states.multisig_user(1, "ms1", 2), states.multisig_user(2, "ms2", 1)],
    [],
    [],
  )
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["ms1"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1230"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Multisig, state_types.Use),
      transaction,
    )
}

test operator_use_rejects_missing_authority() fail {
  let input_state = states.secured_state(
    [states.multisig_user(1, "ms1", 2), states.multisig_user(2, "ms2", 1)],
    [],
    [],
  )
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    [],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1330"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Multisig, state_types.Use),
      transaction,
    )
}

test operator_state_update_accepts_valid_admin_rewrite() {
  let input_state = states.secured_state([states.admin_user("admin")], [], [])
  let output_state = states.secured_state(
    [states.admin_user("admin"), states.renewing_user(1, "renewer")],
    [states.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1430"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_accepts_admin_wallet_name_change() {
  let input_state = states.secured_state([states.admin_user("admin")], [], [])
  let output_state = state_types.State { ..input_state, wallet_name: #"0102" }
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1540"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_rejects_multisig_wallet_name_change() fail {
  let input_state = states.secured_state(
    [states.multisig_user(1, "multisig", 2)],
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
    fixtures.tx_id(#"1541"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Multisig, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_rejects_streaming_payment_edit() fail {
  let streaming_payment = states.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    200_000,
  )
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [states.ada_streaming_payment_ending(1, "beneficiary1", 0, 250_000)],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1530"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test operator_state_update_rejects_invalid_output_configuration() fail {
  let input_state = states.secured_state([states.admin_user("admin")], [], [])
  let output_state = states.base_state()
    |> states.with_users([states.renewing_user(1, "renewer")])
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1630"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test manage_streaming_payments_accepts_extension() {
  let streaming_payment = states.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..states.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      states.ada_streaming_payment_ending(1, "beneficiary1", 0, 200_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1730"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test manage_streaming_payments_rejects_shortening_before_tx_lower_bound() fail {
  let streaming_payment = states.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..states.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      states.ada_streaming_payment_ending(1, "beneficiary1", 0, 100),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1830"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test manage_streaming_payments_rejects_shortening_within_validity_window() fail {
  let streaming_payment = states.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..states.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      states.ada_streaming_payment_ending(1, "beneficiary1", 0, 115),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1930"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

// An admin may ADD a new streaming payment to a live wallet (born unsettled)
// while preserving the existing one. This is the post-mint add path.
test manage_streaming_payments_accepts_adding_new_streaming_payment() {
  let existing_streaming_payment = states.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [existing_streaming_payment],
  )
  let output_state = state_types.State {
    ..states.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      existing_streaming_payment,
      states.ada_streaming_payment_ending(2, "beneficiary2", 0, 200_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1a30"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

// A newly added streaming payment cannot be born already-settled: a non-zero
// paid_out on the fresh entry is rejected even with valid admin authority.
test manage_streaming_payments_rejects_adding_prepaid_streaming_payment() fail {
  let existing_streaming_payment = states.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [existing_streaming_payment],
  )
  let output_state = state_types.State {
    ..states.with_renewed_proof_of_life(input_state, 120),
    wallet_name: #"",
    streaming_payments: [
      existing_streaming_payment,
      states.ada_streaming_payment_ending(2, "beneficiary2", 5, 200_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1a31"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test manage_streaming_payments_rejects_access_control_mutation() fail {
  let streaming_payment = states.ada_streaming_payment_ending(
    1,
    "beneficiary1",
    0,
    150_000,
  )
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = states.secured_state(
    [states.admin_user("admin"), states.renewing_user(1, "renewer")],
    [],
    [states.ada_streaming_payment_ending(1, "beneficiary1", 0, 200_000)],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1931"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(
        state_types.Admin,
        state_types.ManageStreamingPayments,
      ),
      transaction,
    )
}

test renew_proof_of_life_rejects_admin_signer() fail {
  let state_input = states.secured_state(
    [
      state_types.User {
        ..states.admin_user("admin"),
        can_renew_proof_of_life: True,
      },
    ],
    [],
    [],
  )
  let state_output = states.with_renewed_proof_of_life(state_input, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    state_input,
    state_output,
    [],
    fixtures.tx_id(#"2030"),
  )

  expect run_stt_spend(state_types.RenewProofOfLife, transaction)
}

// Security review 2026-07 (Medium). `expect_valid_renewal_window` passes
// TRIVIALLY when `unlock_time` is unchanged, so a bit-identical no-op renewal
// used to be accepted — letting a liveness keeper replay it every block to occupy
// the single STT thread and stall the owner. A renewal must now actually renew.
// Nothing legitimate is lost: a renewal that does not move the deadline forward
// has no effect. Here the eligible keeper signs and every other guard is
// satisfied, so the unchanged `unlock_time` is the sole reason for rejection.
test renew_proof_of_life_rejects_noop_renewal() fail {
  let state = states.secured_state([states.renewing_user(1, "renewer")], [], [])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["renewer"],
    state,
    state,
    [],
    fixtures.tx_id(#"7530"),
  )

  expect run_stt_spend(state_types.RenewProofOfLife, transaction)
}
