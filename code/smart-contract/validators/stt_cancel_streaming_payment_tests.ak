//// STT payee self-cancel tests: CancelStreamingPayment, driven end-to-end
//// through `stt.eval_spend`. The payee of one streaming payment, by signing,
//// caps its OWN `end_date` at "now" (the tx upper bound) and may touch nothing
//// else. See `lib/stt/settlement_handlers.ak::eval_cancel_streaming_payment` and the
//// `is_payee_cancelled` unit tests in `streaming_payments_tests.ak`.

use aiken/interval
use cardano/transaction.{Transaction}
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

const payee_key = "payee1"

// Binds the constant `eval_spend` legs (unused datum, fixture input ref) —
// partial application, not a §4 pure forwarder; only action + tx vary per test.
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

// A single-admin state holding one streaming payment (id 1) paid out to `payee1`,
// accruing 1_000_000/day, ending at `end_date`.
fn state_with_payment(end_date: Int) -> state_types.State {
  states.secured_state(
    [states.admin_user("admin")],
    [],
    [states.ada_streaming_payment_ending(1, payee_key, 0, end_date)],
  )
}

// The payee signs and caps its future end_date (200_000) down to the tx upper
// bound (150_000): a clean self-cancel.
test cancel_streaming_payment_accepts_payee_capping_to_now() {
  let input_state = state_with_payment(200_000)
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      states.ada_streaming_payment_ending(1, payee_key, 0, 150_000)
        |> states.with_cancelled_at(150_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1a30"),
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
      states.ada_streaming_payment_ending(1, payee_key, 0, 150_000)
        |> states.with_cancelled_at(150_000),
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
      states.ada_streaming_payment_ending(1, payee_key, 0, 300_000)
        |> states.with_cancelled_at(150_000),
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
      states.ada_streaming_payment_ending(1, payee_key, 0, 150_000)
        |> states.with_cancelled_at(150_000),
    ],
  }
  let output_state = states.with_renewed_proof_of_life(capped_state, 999)
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
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [
      StreamingPayment {
        ..states.base_streaming_payment(),
        id: 1,
        payout_address: fixtures.script_address(fixtures.key_hash(#"cc")),
        end_date: 200_000,
      },
    ],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      StreamingPayment {
        ..states.base_streaming_payment(),
        id: 1,
        payout_address: fixtures.script_address(fixtures.key_hash(#"cc")),
        end_date: 150_000,
        cancelled_at: Some(150_000),
      },
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
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [
      states.ada_streaming_payment_ending(1, payee_key, 0, 200_000),
      states.ada_streaming_payment_ending(2, "payee2", 0, 200_000),
    ],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      states.ada_streaming_payment_ending(1, payee_key, 0, 150_000)
        |> states.with_cancelled_at(150_000),
      states.ada_streaming_payment_ending(2, "payee2", 0, 200_000),
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

// Security review 2026-07 (High). `eval_cancel_streaming_payment` was the ONLY
// streaming-payment rewrite that skipped `shape.is_valid`, and `end_date_floor`
// capped `end_date` at the tx upper bound with no lower clamp. A payee of a
// NOT-YET-STARTED stream could therefore cap `end_date` BELOW `start_date`,
// committing a negative `lifetime_total` that blocks `UpdateState` (key rotation)
// and every wallet-funded settlement for the whole wallet, repeatably, until
// `start_date` passes.
//
// The payee floor is clamped to `start_date`. This stream starts at day 1
// (86_400_000), ends at day 2, and has a deliberately huge rate where even 1ms
// would accrue 1_000 units. Cancelling before start must create a marked,
// zero-lifetime schedule instead of charging that artificial millisecond.
fn future_stream_state(end_date: Int) -> state_types.State {
  states.secured_state(
    [states.admin_user("admin")],
    [],
    [
      StreamingPayment {
        ..states.base_streaming_payment(),
        id: 1,
        payout_address: fixtures.address_from_key(payee_key),
        amount_per_day: 86_400_000_000,
        start_date: 86_400_000,
        end_date,
      },
    ],
  )
}

test cancel_streaming_payment_clamps_prestart_high_rate_stream_to_zero_lifetime() {
  let input_state = future_stream_state(172_800_000)
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      StreamingPayment {
        ..states.base_streaming_payment(),
        id: 1,
        payout_address: fixtures.address_from_key(payee_key),
        amount_per_day: 86_400_000_000,
        start_date: 86_400_000,
        end_date: 86_400_000,
        cancelled_at: Some(150_000),
      },
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"1f30"),
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// The attack itself: capping `end_date` at the tx upper bound (150_000), below
// this stream's `start_date` (86_400_000). Rejected by the clamped floor, and by
// the `shape.is_valid` guard behind it.
test cancel_streaming_payment_rejects_end_date_below_start_date() fail {
  let input_state = future_stream_state(172_800_000)
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      StreamingPayment {
        ..states.base_streaming_payment(),
        id: 1,
        payout_address: fixtures.address_from_key(payee_key),
        amount_per_day: 86_400_000_000,
        start_date: 86_400_000,
        end_date: 150_000,
        cancelled_at: Some(150_000),
      },
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"2030"),
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}

// Regression for descending validity bounds. This input represents the output
// of an earlier accepted cancel at 180_000. A second payee-signed transaction
// choosing 150_000 cannot shorten it again because the marker is already set.
test cancel_streaming_payment_rejects_descending_upper_bound_replay() fail {
  let first_cancelled_payment = states.ada_streaming_payment_ending(
    1,
    payee_key,
    0,
    180_000,
  )
    |> states.with_cancelled_at(180_000)
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [first_cancelled_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      states.ada_streaming_payment_ending(1, payee_key, 0, 150_000)
        |> states.with_cancelled_at(150_000),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100_000, 150_000),
    [payee_key],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"2130"),
  )

  expect run_stt_spend(state_types.CancelStreamingPayment(1), transaction)
}
