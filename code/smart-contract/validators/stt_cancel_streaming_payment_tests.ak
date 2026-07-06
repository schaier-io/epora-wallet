//// STT payee self-cancel tests: CancelStreamingPayment, driven end-to-end
//// through `stt.eval_spend`. The payee of one streaming payment, by signing,
//// caps its OWN `end_date` at "now" (the tx upper bound) and may touch nothing
//// else. See `lib/stt/settlement_handlers.ak::eval_cancel_streaming_payment` and the
//// `is_payee_cancelled` unit tests in `streaming_payments_tests.ak`.

use aiken/interval
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/intent_fixtures as intent
use test_support/security_fixtures as fixtures

const payee_key = "payee1"

// Binds the constant `eval_spend` legs (unused datum, fixture input ref) —
// partial application, not a §4 pure forwarder; only action + tx vary per test.
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

// A single-admin state holding one streaming payment (id 1) paid out to `payee1`,
// accruing 1_000_000/day, ending at `end_date`.
fn state_with_payment(end_date: Int) -> state_types.State {
  fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [intent.ada_streaming_payment_ending(1, payee_key, 0, end_date)],
  )
}

// The payee signs and caps its future end_date (200_000) down to the tx upper
// bound (150_000): a clean self-cancel.
test cancel_streaming_payment_accepts_payee_capping_to_now() {
  let input_state = state_with_payment(200_000)
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, payee_key, 0, 150_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// Without the payee's signature the cancel is unauthorized — here only the admin
// signs, and admin is NOT the payee of this stream.
test cancel_streaming_payment_rejects_missing_payee_signature() fail {
  let input_state = state_with_payment(200_000)
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, payee_key, 0, 150_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    ["admin"],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000001",
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// The payee may never EXTEND its own stream through cancel: end 200_000 -> 300_000
// is rejected even though the payee signs.
test cancel_streaming_payment_rejects_extend() fail {
  let input_state = state_with_payment(200_000)
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, payee_key, 0, 300_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000002",
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// A cancel may change ONLY streaming_payments: capping the end while also moving
// proof-of-life `unlock_time` is rejected (the payee is not a liveness keeper).
test cancel_streaming_payment_rejects_touching_other_state() fail {
  let input_state = state_with_payment(200_000)
  let capped_state = state_types.State {
    ..input_state,
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, payee_key, 0, 150_000),
    ],
  }
  let output_state = intent.with_renewed_proof_of_life(capped_state, 999)
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000003",
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// One-shot: a no-op cancel (the stream already ends at/before "now", so the floor
// pins the output equal to the input) is rejected by the real-progress guard, so
// a payee cannot replay it to occupy the STT thread.
test cancel_streaming_payment_rejects_noop_replay() fail {
  let input_state = state_with_payment(50_000)
  let output_state = input_state
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000004",
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// A script-credential payee cannot sign, so it has no self-cancel authority —
// even with the script hash placed among the signatories the cancel is rejected.
test cancel_streaming_payment_rejects_script_credential_payee() fail {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [
      fixtures.streaming_payment(
        1,
        fixtures.script_address(#"cc"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        200_000,
      ),
    ],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      fixtures.streaming_payment(
        1,
        fixtures.script_address(#"cc"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        150_000,
      ),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [#"cc"],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000005",
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// Cancelling one stream leaves the payee's OTHER streams untouched: id 1 is capped
// to "now" while id 2 (a different payee) is forwarded exactly.
test cancel_streaming_payment_accepts_capping_one_of_many() {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [
      intent.ada_streaming_payment_ending(1, payee_key, 0, 200_000),
      intent.ada_streaming_payment_ending(2, "payee2", 0, 200_000),
    ],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      intent.ada_streaming_payment_ending(1, payee_key, 0, 150_000),
      intent.ada_streaming_payment_ending(2, "payee2", 0, 200_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    #"1a30000000000000000000000000000000000000000000000000000000000006",
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}
