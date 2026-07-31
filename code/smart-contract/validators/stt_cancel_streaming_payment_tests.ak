//// End-to-end tests for receiver `CancelStreamingPayment` through
//// `stt.eval_spend`: authority, no-clawback shortening, exact preservation,
//// static shape, and the shared non-admin streaming cadence.

use aiken/interval
use cardano/transaction.{Transaction, ValidityRange}
use constants
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

const payee_key = "payee1"

fn run_cancel(id: Int, tx: Transaction) -> Bool {
  stt.eval_spend(
    None,
    state_types.CancelStreamingPayment(id),
    fixtures.stt_input_ref(),
    tx,
  )
}

fn cancel_tx(
  input_state: state_types.State,
  output_state: state_types.State,
  validity_range: ValidityRange,
  signatories: List<ByteArray>,
  tx_id: ByteArray,
) -> Transaction {
  fixtures.stt_spend_tx(
    validity_range,
    signatories,
    input_state,
    output_state,
    [],
    tx_id,
  )
}

fn state_with_payment(end_date: Int) -> state_types.State {
  states.secured_state(
    [states.admin_user("admin")],
    [],
    [states.ada_streaming_payment_ending(1, payee_key, 0, end_date)],
  )
}

fn shortened_state(
  input_state: state_types.State,
  end_date: Int,
  stamp: Option<Int>,
) -> state_types.State {
  state_types.State {
    ..input_state,
    streaming_payments: [
      states.ada_streaming_payment_ending(1, payee_key, 0, end_date),
    ],
    last_non_admin_payout_at: stamp,
  }
}

// A receiver may shorten exactly to the tx upper bound. The same action advances
// the global non-admin streaming clock to that upper bound.
test cancel_streaming_payment_accepts_payee_capping_to_upper_bound() {
  let input_state = state_with_payment(200_000)
  let output_state = shortened_state(input_state, 150_000, Some(150_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a30"),
  )

  expect run_cancel(1, transaction)
}

// Receiver need not cap exactly to "now": any strict shortening that remains at
// or above the upper bound is safe and accepted.
test cancel_streaming_payment_accepts_partial_shortening_above_upper_bound() {
  let input_state = state_with_payment(300_000)
  let output_state = shortened_state(input_state, 200_000, Some(150_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a31"),
  )

  expect run_cancel(1, transaction)
}

test cancel_streaming_payment_rejects_missing_payee_signature() fail {
  let input_state = state_with_payment(200_000)
  let output_state = shortened_state(input_state, 150_000, Some(150_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    ["admin"],
    fixtures.tx_id(#"1a32"),
  )

  expect run_cancel(1, transaction)
}

// Cancel is receiver-self-limiting: it cannot extend the receiver's schedule.
test cancel_streaming_payment_rejects_extension() fail {
  let input_state = state_with_payment(200_000)
  let output_state = shortened_state(input_state, 300_000, Some(150_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a33"),
  )

  expect run_cancel(1, transaction)
}

// Advancing only the cadence stamp is not enough: the target end date must
// strictly decrease on every accepted cancel.
test cancel_streaming_payment_rejects_noop() fail {
  let input_state = state_with_payment(200_000)
  let output_state = shortened_state(input_state, 200_000, Some(150_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a34"),
  )

  expect run_cancel(1, transaction)
}

// Only the target stream and the dedicated cadence clock may change. A receiver
// cannot renew proof-of-life while cancelling.
test cancel_streaming_payment_rejects_touching_other_state() fail {
  let input_state = state_with_payment(200_000)
  let cancelled_state = shortened_state(input_state, 150_000, Some(150_000))
  let output_state = states.with_renewed_proof_of_life(cancelled_state, 999)
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a35"),
  )

  expect run_cancel(1, transaction)
}

// Script credentials cannot produce a transaction signatory, so they have no
// receiver-self-cancel authority.
test cancel_streaming_payment_rejects_script_credential_payee() fail {
  let input_payment = StreamingPayment {
    ..states.base_streaming_payment(),
    id: 1,
    payout_address: fixtures.script_address(fixtures.key_hash(#"cc")),
    end_date: 200_000,
  }
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [input_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      StreamingPayment { ..input_payment, end_date: 150_000 },
    ],
    last_non_admin_payout_at: Some(150_000),
  }
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [fixtures.key_hash(#"cc")],
    fixtures.tx_id(#"1a36"),
  )

  expect run_cancel(1, transaction)
}

// The targeted receiver stream shortens; every other stream is byte-for-byte
// preserved and the list cardinality remains fixed.
test cancel_streaming_payment_accepts_one_of_many() {
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
      states.ada_streaming_payment_ending(1, payee_key, 0, 150_000),
      states.ada_streaming_payment_ending(2, "payee2", 0, 200_000),
    ],
    last_non_admin_payout_at: Some(150_000),
  }
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a37"),
  )

  expect run_cancel(1, transaction)
}

fn future_payment(end_date: Int) -> StreamingPayment {
  StreamingPayment {
    ..states.base_streaming_payment(),
    id: 1,
    payout_address: fixtures.address_from_key(payee_key),
    amount_per_day: 86_400_000_000,
    start_date: 86_400_000,
    end_date,
  }
}

// Before start, the no-clawback floor is start_date itself. Equality creates a
// zero-duration, zero-obligation schedule and avoids fabricating one millisecond
// of payout at a deliberately extreme rate.
test cancel_streaming_payment_accepts_prestart_zero_duration_result() {
  let input_payment = future_payment(172_800_000)
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [input_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      StreamingPayment { ..input_payment, end_date: input_payment.start_date },
    ],
    last_non_admin_payout_at: Some(150_000),
  }
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a38"),
  )

  expect run_cancel(1, transaction)
}

// Below start_date would create a negative lifetime and poison later config and
// settlement paths. Both the receiver floor and general shape reject it.
test cancel_streaming_payment_rejects_end_date_below_start_date() fail {
  let input_payment = future_payment(172_800_000)
  let input_state = states.secured_state(
    [states.admin_user("admin")],
    [],
    [input_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      StreamingPayment { ..input_payment, end_date: 150_000 },
    ],
    last_non_admin_payout_at: Some(150_000),
  }
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a39"),
  )

  expect run_cancel(1, transaction)
}

// No per-payment marker exists. An immediate second shortening is bounded by the
// shared 30-minute clock instead and therefore fails inside the cooldown.
test cancel_streaming_payment_rejects_immediate_repeat_within_cooldown() fail {
  let input_state = state_types.State {
    ..state_with_payment(6_000_000),
    last_non_admin_payout_at: Some(1_000_000),
  }
  let output_state = shortened_state(input_state, 2_000_000, Some(1_200_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(1_100_000, 1_200_000),
    [payee_key],
    fixtures.tx_id(#"1a3a"),
  )

  expect run_cancel(1, transaction)
}

// Cancellation never takes the payout crank's admin exemption. Even when the
// target payee and an admin co-sign, the receiver action remains cadence-limited
// and cannot land before the shared clock reaches `last + cooldown`.
test cancel_streaming_payment_admin_cosign_does_not_bypass_cooldown() fail {
  let input_state = state_types.State {
    ..state_with_payment(6_000_000),
    last_non_admin_payout_at: Some(1_000_000),
  }
  let output_state = shortened_state(input_state, 2_000_000, Some(1_200_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(1_100_000, 1_200_000),
    [payee_key, "admin"],
    fixtures.tx_id(#"1a40"),
  )

  expect run_cancel(1, transaction)
}

// The clock is action-global, not payout-only despite its legacy field name.
// A recent non-admin payout stamp therefore blocks a receiver cancellation in
// exactly the same way as a recent cancellation stamp.
test cancel_streaming_payment_rejects_after_recent_non_admin_payout() fail {
  let recent_payout_upper = 1_000_000
  let input_state = state_types.State {
    ..state_with_payment(6_000_000),
    last_non_admin_payout_at: Some(recent_payout_upper),
  }
  let output_state = shortened_state(input_state, 2_000_000, Some(1_200_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(1_100_000, 1_200_000),
    [payee_key],
    fixtures.tx_id(#"1a41"),
  )

  expect run_cancel(1, transaction)
}

// A cancellation of payment A occupies the single wallet-wide cadence slot.
// Payment B's own payee still has target authority, but cannot cancel B until
// the same global cooldown elapses.
test cancel_streaming_payment_target_a_blocks_target_b_within_cooldown() fail {
  let recent_cancel_upper = 1_000_000
  let input_state = state_types.State {
    ..states.secured_state(
      [states.admin_user("admin")],
      [],
      [
        states.ada_streaming_payment_ending(1, payee_key, 0, 6_000_000),
        states.ada_streaming_payment_ending(2, "payee2", 0, 6_000_000),
      ],
    ),
    last_non_admin_payout_at: Some(recent_cancel_upper),
  }
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: [
      states.ada_streaming_payment_ending(1, payee_key, 0, 6_000_000),
      states.ada_streaming_payment_ending(2, "payee2", 0, 2_000_000),
    ],
    last_non_admin_payout_at: Some(1_200_000),
  }
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(1_100_000, 1_200_000),
    ["payee2"],
    fixtures.tx_id(#"1a42"),
  )

  expect run_cancel(2, transaction)
}

// The same receiver may shorten again once the global cooldown has elapsed.
test cancel_streaming_payment_accepts_repeat_after_cooldown() {
  let last_cancel_upper = 1_000_000
  let tx_earliest = last_cancel_upper + constants.non_admin_payout_cooldown_ms
  let tx_latest = tx_earliest + 100_000
  let input_state = state_types.State {
    ..state_with_payment(6_000_000),
    last_non_admin_payout_at: Some(last_cancel_upper),
  }
  let output_state = shortened_state(input_state, 3_000_000, Some(tx_latest))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(tx_earliest, tx_latest),
    [payee_key],
    fixtures.tx_id(#"1a3b"),
  )

  expect run_cancel(1, transaction)
}

// A bounded but over-wide interval could stamp far into the future. The shared
// cadence caps it at max_payout_validity_window_ms.
test cancel_streaming_payment_rejects_overwide_validity_window() fail {
  let tx_earliest = 100_000
  let tx_latest = tx_earliest + constants.max_payout_validity_window_ms + 1
  let input_state = state_with_payment(10_000_000)
  let output_state = shortened_state(input_state, 5_000_000, Some(tx_latest))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(tx_earliest, tx_latest),
    [payee_key],
    fixtures.tx_id(#"1a3c"),
  )

  expect run_cancel(1, transaction)
}

test cancel_streaming_payment_rejects_missing_cadence_stamp() fail {
  let input_state = state_with_payment(200_000)
  let output_state = shortened_state(input_state, 150_000, None)
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a3d"),
  )

  expect run_cancel(1, transaction)
}

test cancel_streaming_payment_rejects_wrong_cadence_stamp() fail {
  let input_state = state_with_payment(200_000)
  let output_state = shortened_state(input_state, 150_000, Some(149_999))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.between(100_000, 150_000),
    [payee_key],
    fixtures.tx_id(#"1a3e"),
  )

  expect run_cancel(1, transaction)
}

// Both validity bounds are required: the lower gates cooldown and the upper is
// the no-clawback reference/stamp. An open upper bound is rejected.
test cancel_streaming_payment_rejects_unbounded_validity_range() fail {
  let input_state = state_with_payment(200_000)
  let output_state = shortened_state(input_state, 150_000, Some(150_000))
  let transaction = cancel_tx(
    input_state,
    output_state,
    interval.after(100_000),
    [payee_key],
    fixtures.tx_id(#"1a3f"),
  )

  expect run_cancel(1, transaction)
}
