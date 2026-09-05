//// Tests pinning `lib/streaming_payments/payout.ak` (settlement-leg
//// transition rules: how a payout may rewrite the streaming-payment list and
//// which tagged outputs it must emit).

use aiken/interval
use cardano/assets
use cardano/transaction.{OutputReference}
use streaming_payments/payout
use streaming_payments/types.{StreamingPayment}
use test_support/security_fixtures as fixtures
use test_support/streaming_payment_test_helpers.{
  mk_address, mk_output, mk_streaming_payment,
}

test streaming_payment_changes_match_payout_outputs_accept_matching_tagged_payout() {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: fixtures.tx_id(#"1230"),
    output_index: 0,
  }
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(1, address, 1_000_000, 1_000_000, 3 * 86_400_000),
  ]

  expect
    payout.payout_is_valid(
      expected_ref,
      [mk_output(address, 1_000_000, expected_ref, 1)],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(86_400_000, 86_400_000),
    )
}

test payout_changes_reject_duplicate_output_streaming_payment_ids() fail {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: fixtures.tx_id(#"1230"),
    output_index: 0,
  }
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(1, address, 1_000_000, 1_000_000, 3 * 86_400_000),
    mk_streaming_payment(1, address, 1_000_000, 1_000_000, 3 * 86_400_000),
  ]

  expect
    payout.payout_is_valid(
      expected_ref,
      [mk_output(address, 1_000_000, expected_ref, 1)],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(86_400_000, 86_400_000),
    )
}

// Audit L1: a fully-settled entry (paid_out == lifetime_total) whose end_date is
// still in the future may be REMOVED early, with no tagged output, because it
// owes nothing. Without this the entry could be neither retained nor removed and
// would wedge the whole crank until its end_date. lifetime_total
// here = 3 days * 1_000_000/day = 3_000_000; paid_out is set equal to it while
// end_date (3 days) is still ahead of tx_earliest (1 day).
test payout_allows_early_removal_of_fully_settled_entry() {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: fixtures.tx_id(#"1230"),
    output_index: 0,
  }
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 3_000_000, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = []

  expect
    payout.payout_is_valid(
      expected_ref,
      [],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(86_400_000, 86_400_000),
    )
}

// A zero-duration schedule has lifetime_total 0, so paid_out (0) == lifetime
// total (0): it is safely removable even before its timestamp.
test payout_allows_early_removal_of_zero_lifetime_entry() {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: fixtures.tx_id(#"1230"),
    output_index: 0,
  }
  let zero_duration = StreamingPayment {
    ..mk_streaming_payment(1, address, 0, 86_400_000_000, 86_400_000),
    start_date: 86_400_000,
  }
  let input_streaming_payments = [zero_duration]
  let output_streaming_payments = []

  expect
    payout.payout_is_valid(
      expected_ref,
      [],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(1_000, 1_000),
    )
}

// The zero-duration form may not linger after a payout crank. It owes
// nothing, so the retained-entry `still_owes` rule forces removal.
test payout_rejects_retaining_zero_lifetime_entry() fail {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: fixtures.tx_id(#"1231"),
    output_index: 0,
  }
  let zero_duration = StreamingPayment {
    ..mk_streaming_payment(1, address, 0, 86_400_000_000, 86_400_000),
    start_date: 86_400_000,
  }

  expect
    payout.payout_is_valid(
      expected_ref,
      [],
      [zero_duration],
      [zero_duration],
      interval.between(1_000, 1_000),
    )
}

// Guard the other side of the fix: an entry that still OWES (paid_out <
// lifetime_total) and has NOT matured cannot be removed — it must be retained
// and settled through the payout path instead.
test payout_rejects_removal_of_owing_unmatured_entry() fail {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: fixtures.tx_id(#"1230"),
    output_index: 0,
  }
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 1_000_000, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = []

  expect
    payout.payout_is_valid(
      expected_ref,
      [mk_output(address, 2_000_000, expected_ref, 1)],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(86_400_000, 86_400_000),
    )
}

test total_value_change_handles_lovelace() {
  let address = mk_address(#"01")
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(1, address, 1_000_000, 1_000_000, 3 * 86_400_000),
  ]

  expect
    payout.total_value_change(
      input_streaming_payments,
      output_streaming_payments,
    ) == assets.from_lovelace(1_000_000)
}

test validated_value_change_accepts_ordered_subsequence_and_accumulates_assets() {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let token_policy = #"70"
  let token_name = #"54"
  let settled_removed = mk_streaming_payment(
    1,
    address,
    3_000_000,
    1_000_000,
    3 * 86_400_000,
  )
  let unchanged = mk_streaming_payment(2, address, 0, 1_000_000, 3 * 86_400_000)
  let ada_changed = mk_streaming_payment(
    3,
    address,
    0,
    1_000_000,
    3 * 86_400_000,
  )
  let matured_token_removed = StreamingPayment {
    ..mk_streaming_payment(4, address, 0, 2, 86_400_000),
    policy_id: token_policy,
    asset_name: token_name,
  }
  let shared_ada_changed = mk_streaming_payment(
    5,
    address,
    0,
    1_000_000,
    3 * 86_400_000,
  )
  let input_streaming_payments = [
    settled_removed, unchanged, ada_changed, matured_token_removed,
    shared_ada_changed,
  ]
  let output_streaming_payments = [
    unchanged,
    StreamingPayment { ..ada_changed, paid_out_amount: 1_000_000 },
    shared_ada_changed,
  ]
  let token_output = fixtures.tagged_streaming_payment_output(
    address,
    assets.from_asset(token_policy, token_name, 2),
    expected_ref,
    4,
  )

  expect Some(value_change) = payout.validated_value_change(
    expected_ref,
    [mk_output(address, 1_000_000, expected_ref, 3), token_output],
    input_streaming_payments,
    output_streaming_payments,
    interval.between(86_400_000, 86_400_000),
  )
  value_change == assets.merge(
    assets.from_lovelace(1_000_000),
    assets.from_asset(token_policy, token_name, 2),
  )
}

test payout_accepts_two_positive_schedule_changes() {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let first = mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000)
  let second = mk_streaming_payment(2, address, 0, 1_000_000, 3 * 86_400_000)
  let unchanged = mk_streaming_payment(3, address, 0, 1_000_000, 3 * 86_400_000)

  expect
    payout.payout_is_valid(
      expected_ref,
      [
        mk_output(address, 1, expected_ref, 1),
        mk_output(address, 1, expected_ref, 2),
      ],
      [first, second, unchanged],
      [
        StreamingPayment { ..first, paid_out_amount: 1 },
        StreamingPayment { ..second, paid_out_amount: 1 },
        unchanged,
      ],
      interval.between(86_400_000, 86_400_000),
    )
}

test payout_rejects_three_positive_schedule_changes() fail {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let first = mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000)
  let second = mk_streaming_payment(2, address, 0, 1_000_000, 3 * 86_400_000)
  let third = mk_streaming_payment(3, address, 0, 1_000_000, 3 * 86_400_000)

  expect
    payout.payout_is_valid(
      expected_ref,
      [
        mk_output(address, 1, expected_ref, 1),
        mk_output(address, 1, expected_ref, 2),
        mk_output(address, 1, expected_ref, 3),
      ],
      [first, second, third],
      [
        StreamingPayment { ..first, paid_out_amount: 1 },
        StreamingPayment { ..second, paid_out_amount: 1 },
        StreamingPayment { ..third, paid_out_amount: 1 },
      ],
      interval.between(86_400_000, 86_400_000),
    )
}

test payout_allows_many_zero_value_cleanups() {
  let address = mk_address(#"01")
  let first = mk_streaming_payment(
    1,
    address,
    3_000_000,
    1_000_000,
    3 * 86_400_000,
  )
  let second = mk_streaming_payment(
    2,
    address,
    3_000_000,
    1_000_000,
    3 * 86_400_000,
  )
  let third = mk_streaming_payment(
    3,
    address,
    3_000_000,
    1_000_000,
    3 * 86_400_000,
  )

  payout.payout_is_valid(
    payout_ref(),
    [],
    [first, second, third],
    [],
    interval.between(86_400_000, 86_400_000),
  )
}

test payout_rejects_reordered_output_streaming_payments() fail {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let first = mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000)
  let second = mk_streaming_payment(2, address, 0, 1_000_000, 3 * 86_400_000)

  expect
    payout.payout_is_valid(
      expected_ref,
      [],
      [first, second],
      [second, first],
      interval.between(86_400_000, 86_400_000),
    )
}

test validated_value_change_rejects_duplicate_output_id() fail {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let first = mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000)
  let second = mk_streaming_payment(2, address, 0, 1_000_000, 3 * 86_400_000)

  expect Some(value_change) = payout.validated_value_change(
    expected_ref,
    [],
    [first, second],
    [first, first],
    interval.between(86_400_000, 86_400_000),
  )
  value_change == assets.zero
}

test validated_value_change_accepts_unchanged_owing_entry() {
  let address = mk_address(#"01")
  let unchanged = mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000)

  expect Some(value_change) = payout.validated_value_change(
    payout_ref(),
    [],
    [unchanged],
    [unchanged],
    interval.between(86_400_000, 86_400_000),
  )
  value_change == assets.zero
}

// ---------------------------------------------------------------------------
// Guard-isolation tests for `valid_requested_payout_change` /
// `streaming_payments_only_change_existing_entries`. Each violates exactly ONE
// rule of a retained payout (every other rule satisfiable), pinning that rule
// against a tautology — the targeted guard is the SOLE reason for rejection.
// Tagged outputs are sized generously so the only failing predicate is the one
// named. (mutation-sweep survivors: monotonic / within-max / still-owes /
// only-existing — each confirmed killed only by its matching test below.)
// ---------------------------------------------------------------------------

fn payout_ref() -> OutputReference {
  OutputReference { transaction_id: fixtures.tx_id(#"1230"), output_index: 0 }
}

// pa.monotonic — `paid_out_amount` may never decrease.
test payout_rejects_decreasing_paid_out_amount() fail {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 1_000_000, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  expect
    payout.payout_is_valid(
      expected_ref,
      [mk_output(address, 0, expected_ref, 1)],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(86_400_000, 86_400_000),
    )
}

// pa.within_max — a retained payout may not exceed the time-accrued maximum.
// Accrued at 1 day = 1_000_000, but the entry tries to settle 2_000_000 (still
// below the 3_000_000 lifetime total, so `retained_entry_still_owes` holds).
test payout_rejects_payout_above_accrued_maximum() fail {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(1, address, 2_000_000, 1_000_000, 3 * 86_400_000),
  ]
  expect
    payout.payout_is_valid(
      expected_ref,
      [mk_output(address, 2_000_000, expected_ref, 1)],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(86_400_000, 86_400_000),
    )
}

// pa.still_owes — a RETAINED entry must still owe (paid_out < lifetime_total).
// Here it is fully accrued (3 days elapsed) and fully paid (3_000_000), yet kept
// in the output instead of being removed; it must be rejected so a fully-settled
// entry cannot linger.
test payout_rejects_retaining_fully_paid_entry() fail {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(1, address, 3_000_000, 1_000_000, 3 * 86_400_000),
  ]
  expect
    payout.payout_is_valid(
      expected_ref,
      [mk_output(address, 3_000_000, expected_ref, 1)],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(3 * 86_400_000, 3 * 86_400_000),
    )
}

// pa.only_existing — a payout may not introduce a brand-new streaming-payment id.
// The pre-existing id 1 makes zero progress (valid); the injected id 2 is the
// sole reason for rejection.
test payout_rejects_introducing_new_streaming_payment_id() fail {
  let address = mk_address(#"01")
  let expected_ref = payout_ref()
  let input_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  let output_streaming_payments = [
    mk_streaming_payment(1, address, 0, 1_000_000, 3 * 86_400_000),
    mk_streaming_payment(2, address, 0, 1_000_000, 3 * 86_400_000),
  ]
  expect
    payout.payout_is_valid(
      expected_ref,
      [],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(86_400_000, 86_400_000),
    )
}
