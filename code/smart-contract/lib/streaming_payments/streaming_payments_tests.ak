use aiken/collection/list
use aiken/fuzz
use aiken/interval
use cardano/address.{Address, Script}
use cardano/assets
use cardano/transaction.{InlineDatum, Output, OutputReference}
use state/types as state_types
use streaming_payments/forwarding
use streaming_payments/funding
use streaming_payments/payout
use streaming_payments/shape
use streaming_payments/types.{OutputId, StreamingPayment}

fn mk_address(hash: ByteArray) -> Address {
  Address { payment_credential: Script(hash), stake_credential: None }
}

fn mk_streaming_payment(
  id: Int,
  payout_address: Address,
  paid_out_amount: Int,
  amount_per_day: Int,
  end_date: Int,
) -> StreamingPayment {
  StreamingPayment {
    id,
    payout_address,
    paid_out_amount,
    policy_id: #"",
    asset_name: #"",
    amount_per_day,
    start_date: 0,
    end_date,
  }
}

fn mk_output(
  address: Address,
  quantity: Int,
  expected_ref: OutputReference,
  streaming_payment_id: Int,
) -> Output {
  Output {
    address,
    value: assets.from_lovelace(quantity),
    datum: InlineDatum(
      OutputId {
        id: streaming_payment_id,
        transaction_id: expected_ref.transaction_id,
        output_index: expected_ref.output_index,
      },
    ),
    reference_script: None,
  }
}

test streaming_payments_are_valid_accept_distinct_ids() {
  expect
    shape.expect_valid(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
        mk_streaming_payment(1, mk_address(#"02"), 0, 2, 20),
      ],
    )
}

test streaming_payments_are_valid_reject_duplicate_ids() fail {
  expect
    shape.expect_valid(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
        mk_streaming_payment(0, mk_address(#"02"), 0, 2, 20),
      ],
    )
}

test streaming_payment_remains_funded_for_empty_schedule() {
  let state = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }

  expect
    funding.expect_remain_funded(
      state,
      assets.from_lovelace(0),
      assets.from_lovelace(0),
      0,
    )
}

test streaming_payment_remains_funded_for_lovelace_schedule() {
  let state = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [
      mk_streaming_payment(0, mk_address(#"01"), 0, 1_000_000, 3 * 86_400_000),
    ],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }

  expect
    funding.expect_remain_funded(
      state,
      assets.from_lovelace(2_000_000),
      assets.from_lovelace(1_100_000),
      86_400_000,
    )
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
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50)],
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
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 70)],
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
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 40)],
      0,
      50,
    )
}

// A payee can never EXTEND via cancel: end 100 -> 200 is rejected.
test is_payee_cancelled_reject_extend() fail {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 100)],
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 200)],
      0,
      50,
    )
}

// When the targeted payment already ends at/before "now" (end 30, tx_latest_time
// 50), the floor is min(30, 50) = 30, so the only valid output preserves it — a
// no-op the handler's real-progress guard then rejects. Here we assert the rule
// itself ACCEPTS the unchanged output (the no-op rejection lives in the handler).
test is_payee_cancelled_accept_noop_when_already_past() {
  expect
    forwarding.is_payee_cancelled(
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 30)],
      [mk_streaming_payment(0, mk_address(#"01"), 0, 1, 30)],
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
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50),
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
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 50),
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
      [mk_streaming_payment(0, mk_address(#"01"), 0, 9, 50)],
      0,
      50,
    )
}

test streaming_payment_changes_match_payout_outputs_accept_matching_tagged_payout() {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: #"1230000000000000000000000000000000000000000000000000000000000000",
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
    transaction_id: #"1230000000000000000000000000000000000000000000000000000000000000",
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
// would wedge the whole permissionless crank until its end_date. lifetime_total
// here = 3 days * 1_000_000/day = 3_000_000; paid_out is set equal to it while
// end_date (3 days) is still ahead of tx_earliest (1 day).
test payout_allows_early_removal_of_fully_settled_entry() {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: #"1230000000000000000000000000000000000000000000000000000000000000",
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

// A sub-day-unit schedule rounds lifetime_total down to 0, so paid_out (0) ==
// lifetime_total (0): the same wedge class, also removable early.
test payout_allows_early_removal_of_zero_lifetime_entry() {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: #"1230000000000000000000000000000000000000000000000000000000000000",
    output_index: 0,
  }
  // amount_per_day 1, end_date 1 day → lifetime_total = floor(86_400_000 * 1 /
  // 86_400_000) = 1. Use end_date < one day so lifetime_total floors to 0.
  let input_streaming_payments = [mk_streaming_payment(1, address, 0, 1, 1_000)]
  let output_streaming_payments = []

  expect
    payout.payout_is_valid(
      expected_ref,
      [],
      input_streaming_payments,
      output_streaming_payments,
      interval.between(1, 1),
    )
}

// Guard the other side of the fix: an entry that still OWES (paid_out <
// lifetime_total) and has NOT matured cannot be removed — it must be retained
// and settled through the payout path instead.
test payout_rejects_removal_of_owing_unmatured_entry() fail {
  let address = mk_address(#"01")
  let expected_ref = OutputReference {
    transaction_id: #"1230000000000000000000000000000000000000000000000000000000000000",
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
  OutputReference {
    transaction_id: #"1230000000000000000000000000000000000000000000000000000000000000",
    output_index: 0,
  }
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

// ---------------------------------------------------------------------------
// Tests for the accrual floor division
// (`calculate_payout_amount_for_elapsed_time` = `elapsed * rate / 86_400_000`),
// the rounding-sensitive core the broader suite under-covers. Two concrete
// anchors document the key boundaries; the `prop_*` fuzz tests then assert the
// general invariants over random non-negative inputs (the domain upstream
// guarantees: `amount_per_day >= 0`, `elapsed >= 0`).
// ---------------------------------------------------------------------------

test payout_exact_whole_day() {
  funding.calculate_payout_amount_for_elapsed_time(86_400_000, 5) == 5
}

test payout_sub_unit_elapsed_rounds_to_zero() {
  // 1 ms at 1 unit/day accrues 1/86_400_000 of a unit → floored to 0 (dust).
  funding.calculate_payout_amount_for_elapsed_time(1, 1) == 0
}

test prop_payout_non_negative(
  args via fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
) {
  let (elapsed, rate) = args
  funding.calculate_payout_amount_for_elapsed_time(elapsed, rate) >= 0
}

// Floor division pins the exact rounding: the true product must land in
// `[payout * day, (payout + 1) * day)`.
test prop_payout_is_exact_floor(
  args via fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
) {
  let (elapsed, rate) = args
  let payout = funding.calculate_payout_amount_for_elapsed_time(elapsed, rate)
  let day = 86_400_000
  and {
    payout * day <= elapsed * rate,
    elapsed * rate < ( payout + 1 ) * day,
  }
}

// More elapsed time never pays out less (monotonic in the accrual window).
test prop_payout_monotonic_in_elapsed(
  args via fuzz.both(
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
    fuzz.int_at_least(0),
  ),
) {
  let ((elapsed, extra), rate) = args
  let less = funding.calculate_payout_amount_for_elapsed_time(elapsed, rate)
  let more = funding.calculate_payout_amount_for_elapsed_time(
    elapsed + extra,
    rate,
  )
  more >= less
}

// ---------------------------------------------------------------------------
// Direct tests for the streaming-payment reserve
// (`calculate_minimum_output_value` / `expect_remain_funded`): the per-asset
// accumulation, the `+1` rounding buffer, the end_date accrual cap, and the
// clamp at zero for an over-paid entry. The wallet-spend integration tests
// (`wallet_spend_tests.ak`) drive the same math through `eval_spend`; these pin
// the arithmetic itself.
// ---------------------------------------------------------------------------

fn mk_streaming_payment_in_asset(
  id: Int,
  policy_id: ByteArray,
  asset_name: ByteArray,
  paid_out_amount: Int,
  amount_per_day: Int,
  end_date: Int,
) -> StreamingPayment {
  StreamingPayment {
    id,
    payout_address: mk_address(#"01"),
    paid_out_amount,
    policy_id,
    asset_name,
    amount_per_day,
    start_date: 0,
    end_date,
  }
}

const one_day: Int = 86_400_000

// One day accrued at 1_000_000/day with nothing paid out: the reserve is the
// accrued amount plus the `+1` rounding buffer.
test reserve_includes_rounding_buffer() {
  let reserve = funding.calculate_minimum_output_value(
    [mk_streaming_payment(0, mk_address(#"01"), 0, 1_000_000, 3 * one_day)],
    one_day,
  )
  assets.lovelace_of(reserve) == 1_000_001
}

// Two payments in the SAME asset accumulate into one per-asset reserve;
// a payment in a DIFFERENT asset is reserved independently.
test reserve_accumulates_per_asset_across_payments() {
  let reserve = funding.calculate_minimum_output_value(
    [
      mk_streaming_payment(0, mk_address(#"01"), 0, 1_000_000, 3 * one_day),
      mk_streaming_payment(1, mk_address(#"02"), 0, 500_000, 3 * one_day),
      mk_streaming_payment_in_asset(2, #"cc", #"dd", 0, 7, 3 * one_day),
    ],
    one_day,
  )
  and {
    // 1_000_000 + 1 + 500_000 + 1 — buffers accumulate per payment.
    assets.lovelace_of(reserve) == 1_500_002,
    assets.quantity_of(reserve, #"cc", #"dd") == 8,
  }
}

// A matured payment stops accruing at end_date: measuring far past maturity
// reserves only the lifetime remainder (plus the buffer), not unbounded growth.
test reserve_caps_accrual_at_end_date() {
  let reserve = funding.calculate_minimum_output_value(
    [mk_streaming_payment(0, mk_address(#"01"), 0, 1_000_000, 2 * one_day)],
    100 * one_day,
  )
  assets.lovelace_of(reserve) == 2_000_001
}

// An entry whose payouts already cover accrued + buffer reserves exactly zero —
// the `math.max(0, …)` clamp keeps an over-paid entry from producing a negative
// reserve that would offset OTHER payments' reserves in the same asset.
test reserve_clamps_overpaid_entry_at_zero() {
  let reserve = funding.calculate_minimum_output_value(
    [
      mk_streaming_payment(
        0,
        mk_address(#"01"),
        3_000_000,
        1_000_000,
        3 * one_day,
      ),
      mk_streaming_payment(1, mk_address(#"02"), 0, 1_000_000, 3 * one_day),
    ],
    one_day,
  )
  // Entry 0 is over-paid (3_000_000 paid vs 1_000_001 owed) → contributes 0,
  // NOT -1_999_999; entry 1 still reserves its full 1_000_001.
  assets.lovelace_of(reserve) == 1_000_001
}

// Direct negative for the spend guard: draining a reserved asset below
// `min(input, reserve)` must fail.
test reserve_guard_rejects_draining_below_reserve() fail {
  let state = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [
      mk_streaming_payment(0, mk_address(#"01"), 0, 1_000_000, 3 * one_day),
    ],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
  // Reserve at one day = 1_000_001; the output leaves only 1_000_000.
  expect
    funding.expect_remain_funded(
      state,
      assets.from_lovelace(2_000_000),
      assets.from_lovelace(1_000_000),
      one_day,
    )
}

// Fuzzed payment over the domain `shape.expect_valid` admits (non-negative
// fields, start < end, not born over-paid), with start_date pinned to 0 so the
// fuzzed `at_time` doubles as the elapsed time.
fn payment_args_gen() -> Fuzzer<((Int, Int), (Int, Int))> {
  fuzz.both(
    fuzz.both(fuzz.int_between(1, 10 * one_day), fuzz.int_between(0, 1_000_000)),
    fuzz.both(fuzz.int_at_least(0), fuzz.int_between(0, 20 * one_day)),
  )
}

fn payment_from(end_date: Int, rate: Int, paid_out: Int) -> StreamingPayment {
  // Clamp paid_out into the mint-valid range [0, lifetime_total].
  let payment = mk_streaming_payment(0, mk_address(#"01"), 0, rate, end_date)
  let lifetime = funding.lifetime_total(payment)
  StreamingPayment {
    ..payment,
    paid_out_amount: if paid_out > lifetime {
      lifetime
    } else {
      paid_out
    },
  }
}

// The reserve never goes negative in any asset, for any mint-valid payment at
// any measurement time.
test prop_reserve_never_negative(args via payment_args_gen()) {
  let ((end_date, rate), (paid_out, at_time)) = args
  let reserve = funding.calculate_minimum_output_value(
    [payment_from(end_date, rate, paid_out)],
    at_time,
  )
  list.all(assets.flatten(reserve), fn(asset) { asset.3rd >= 0 })
}

// The reserve always covers what the payee is owed so far: accrued-to-time
// minus already paid out (the buffer only ever adds on top).
test prop_reserve_covers_accrued_minus_paid(args via payment_args_gen()) {
  let ((end_date, rate), (paid_out, at_time)) = args
  let payment = payment_from(end_date, rate, paid_out)
  let reserve = funding.calculate_minimum_output_value([payment], at_time)
  assets.lovelace_of(reserve) >= funding.accrued_at(payment, at_time) - payment.paid_out_amount
}

// Measuring later never shrinks the reserve (monotone in the tx upper bound),
// so a beneficiary cannot free up reserved funds by picking a LATER bound; the
// point-in-time yield documented in the whitepaper ("Streaming reserve is
// point-in-time") comes from choosing an EARLY bound, which is capped below by
// the ledger's "tx_latest >= now".
test prop_reserve_monotone_in_time(
  args via fuzz.both(payment_args_gen(), fuzz.int_between(0, 864_000_000)),
) {
  let (((end_date, rate), (paid_out, at_time)), extra) = args
  let payment = payment_from(end_date, rate, paid_out)
  let earlier = funding.calculate_minimum_output_value([payment], at_time)
  let later = funding.calculate_minimum_output_value([payment], at_time + extra)
  assets.lovelace_of(later) >= assets.lovelace_of(earlier)
}
