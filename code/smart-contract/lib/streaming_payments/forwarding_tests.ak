//// Tests pinning `lib/streaming_payments/forwarding.ak` (forward / reschedule
//// transition rules for the no-payout paths, including the payee self-cancel
//// rewrite rule `is_payee_cancelled`).

use streaming_payments/forwarding
use test_support/streaming_payment_test_helpers.{
  mk_address, mk_streaming_payment, with_cancelled_at,
}

test are_forwarded_accept_exact_match() {
  let input_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
  ]

  expect
    forwarding.are_forwarded(
      input_streaming_payments,
      output_streaming_payments,
    )
}

test are_forwarded_rescheduled_or_added_accept_longer_end_date() {
  let input_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 20),
  ]

  expect
    forwarding.are_forwarded_rescheduled_or_added(
      input_streaming_payments,
      output_streaming_payments,
      None,
    )
}

// Cancel = stop future accrual: end_date moved DOWN from 100 to 60 with the tx
// invalid_hereafter at 50. 60 >= min(100, 50) = 50, so it is allowed — accrual
// stops at 60 and nothing already accrued is clawed back.
test are_forwarded_rescheduled_or_added_accept_stop_future_accrual() {
  let input_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 60),
  ]

  expect
    forwarding.are_forwarded_rescheduled_or_added(
      input_streaming_payments,
      output_streaming_payments,
      Some(50),
    )
}

// No clawback: end_date cannot drop below the invalid_hereafter floor (40 <
// min(100, 50) = 50), since that would erase value that already accrued.
test are_forwarded_rescheduled_or_added_reject_clawback_below_now() fail {
  let input_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 40),
  ]

  expect
    forwarding.are_forwarded_rescheduled_or_added(
      input_streaming_payments,
      output_streaming_payments,
      Some(50),
    )
}

// With no finite upper bound the floor is input.end_date, so shortening is
// rejected (cannot prove "not in the past"); only forwarding/extending works.
test are_forwarded_rescheduled_or_added_reject_shorten_when_unbounded() fail {
  let input_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(0, mk_address(#"01"), 0, 1, 60),
  ]

  expect
    forwarding.are_forwarded_rescheduled_or_added(
      input_streaming_payments,
      output_streaming_payments,
      None,
    )
}

// The manage path cannot DROP an existing streaming payment — every input must
// still be forwarded into the output. A payment only fully leaves the set via
// settlement in PayStreamingPayment; an operator "cancels" by rescheduling
// end_date down to tx_latest_time, not by removing the entry.
test are_forwarded_rescheduled_or_added_reject_drop() fail {
  expect
    forwarding.are_forwarded_rescheduled_or_added(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [],
      Some(50),
    )
}

// An operator may ADD a brand-new streaming payment alongside the preserved
// existing ones (born unsettled). This is the post-mint add path.
test are_forwarded_rescheduled_or_added_accept_add_new() {
  let existing = mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)
  expect
    forwarding.are_forwarded_rescheduled_or_added(
      [existing],
      [existing, mk_streaming_payment(1, mk_address(#"02"), 0, 2, 200)],
      Some(50),
    )
}

// Adding to an empty set (0 -> 1) is allowed: this is the first streaming payment
// configured on a live wallet.
test are_forwarded_rescheduled_or_added_accept_add_to_empty() {
  expect
    forwarding.are_forwarded_rescheduled_or_added(
      [],
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      Some(50),
    )
}

// A newly added payment must be born unsettled: a non-zero paid_out on a fresh
// id is rejected (only settlement may advance paid_out).
test are_forwarded_rescheduled_or_added_reject_new_with_paid_out() fail {
  expect
    forwarding.are_forwarded_rescheduled_or_added(
      [],
      [mk_streaming_payment(0, mk_address(#"01"), 5, 1, 100)],
      Some(50),
    )
}

// Adding may not be used to silently drop an existing payee: a tx that adds one
// entry but omits a prior one is rejected (the omitted input is not preserved).
test are_forwarded_rescheduled_or_added_reject_add_while_dropping() fail {
  expect
    forwarding.are_forwarded_rescheduled_or_added(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100),
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100),
      ],
      [
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100),
        mk_streaming_payment(2, mk_address(#"03"), 0, 1, 100),
      ],
      Some(50),
    )
}

// Adding may not be used to mutate an existing payee's immutable fields: the
// preserved leg pins core fields (here amount_per_day changes 1 -> 9).
test are_forwarded_rescheduled_or_added_reject_add_while_mutating_existing() fail {
  expect
    forwarding.are_forwarded_rescheduled_or_added(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 9, 100),
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100),
      ],
      Some(50),
    )
}

// --- is_payee_cancelled (payee self-cancel rewrite rule) ---

// A future end_date is capped at "now" (the tx upper bound) for the targeted id:
// end 100 -> 50 with tx_latest_time 50. min(100, 50) = 50.
test is_payee_cancelled_accept_caps_future_end_to_now() {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50)
          |> with_cancelled_at(50),
      ],
      0,
      50,
    )
}

// The cancel must land EXACTLY on the floor — a partial shorten that stops above
// "now" (end 100 -> 70 with tx_latest_time 50) is rejected: cancel is one-shot to
// now, not an arbitrary reschedule (that is the operator path).
test is_payee_cancelled_reject_partial_shorten_above_now() fail {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 70)
          |> with_cancelled_at(50),
      ],
      0,
      50,
    )
}

// No clawback below "now": end 100 -> 40 with tx_latest_time 50 is rejected
// (40 < min(100, 50) = 50). The cap pins the floor exactly, so anything below it
// is impossible.
test is_payee_cancelled_reject_clawback_below_now() fail {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 40)
          |> with_cancelled_at(50),
      ],
      0,
      50,
    )
}

// A payee can never EXTEND via cancel: end 100 -> 200 is rejected.
test is_payee_cancelled_reject_extend() fail {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 200)
          |> with_cancelled_at(50),
      ],
      0,
      50,
    )
}

// An already-ended schedule has no future accrual to stop. Even writing the
// marker is rejected because cancellation must strictly shorten `end_date`.
test is_payee_cancelled_reject_noop_when_already_past() fail {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 30)],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 30)
          |> with_cancelled_at(50),
      ],
      0,
      50,
    )
}

// Only the targeted id may move: cancelling id 0 while id 1's end_date also
// changes (100 -> 60) is rejected — every non-target payment is forwarded exactly.
test is_payee_cancelled_reject_touching_other_payment() fail {
  expect
    forwarding.is_payee_cancelled(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100),
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100),
      ],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50)
          |> with_cancelled_at(50),
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 60),
      ],
      0,
      50,
    )
}

// A non-target payment is preserved EXACTLY while the target is capped: id 0
// capped 100 -> 50, id 1 untouched at 100.
test is_payee_cancelled_accept_caps_target_preserves_others() {
  expect
    forwarding.is_payee_cancelled(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100),
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100),
      ],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50)
          |> with_cancelled_at(50),
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100),
      ],
      0,
      50,
    )
}

// Cancel may not DROP a payment: cancelling id 0 by omitting it from the output
// is rejected (length must be preserved).
test is_payee_cancelled_reject_drop() fail {
  expect
    forwarding.is_payee_cancelled(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100),
        mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100),
      ],
      [mk_streaming_payment(1, mk_address(#"02"), 0, 1, 100)],
      0,
      50,
    )
}

// Cancel may not mutate the target's immutable core fields under cover of the
// end-date change: capping the end while also bumping amount_per_day (1 -> 9) is
// rejected.
test is_payee_cancelled_reject_mutating_core_fields() fail {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 9, 50)
          |> with_cancelled_at(50),
      ],
      0,
      50,
    )
}

// Regression: after the first cancel wrote a durable marker, choosing a smaller
// upper bound cannot create a second valid shortening transition.
test is_payee_cancelled_rejects_descending_upper_bound_replay() fail {
  expect
    forwarding.is_payee_cancelled(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 80)
          |> with_cancelled_at(80),
      ],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50)
          |> with_cancelled_at(50),
      ],
      0,
      50,
    )
}

// Payee cancellation is terminal. Operator management may forward a marked
// schedule but cannot extend it back into an accruing stream.
test are_forwarded_rescheduled_or_added_rejects_extending_cancelled_payment() fail {
  expect
    forwarding.are_forwarded_rescheduled_or_added(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50)
          |> with_cancelled_at(50),
      ],
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)
          |> with_cancelled_at(50),
      ],
      Some(60),
    )
}
