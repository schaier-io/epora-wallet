//// Tests pinning `lib/streaming_payments/funding.ak` (accrual math and the
//// per-asset streaming-payment reserve): the `remains_funded` spend
//// guard, the accrual floor division, and the reserve arithmetic.

use aiken/collection/list
use aiken/fuzz
use cardano/assets
use state/types as state_types
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment}
use test_support/streaming_payment_test_helpers.{
  mk_address, mk_streaming_payment,
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
    last_non_admin_payout_at: None,
  }

  expect
    funding.remains_funded(
      funding.calculate_streaming_reserve(state.streaming_payments, 0),
      assets.from_lovelace(0),
      assets.from_lovelace(0),
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
    last_non_admin_payout_at: None,
  }

  expect
    funding.remains_funded(
      funding.calculate_streaming_reserve(state.streaming_payments, 86_400_000),
      assets.from_lovelace(2_000_000),
      assets.from_lovelace(1_100_000),
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
// (`calculate_streaming_reserve` / `remains_funded`): the per-asset
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
  let reserve = funding.calculate_streaming_reserve(
    [mk_streaming_payment(0, mk_address(#"01"), 0, 1_000_000, 3 * one_day)],
    one_day,
  )
  assets.lovelace_of(reserve) == 1_000_001
}

// Two payments in the SAME asset accumulate into one per-asset reserve;
// a payment in a DIFFERENT asset is reserved independently.
test reserve_accumulates_per_asset_across_payments() {
  let reserve = funding.calculate_streaming_reserve(
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
  let reserve = funding.calculate_streaming_reserve(
    [mk_streaming_payment(0, mk_address(#"01"), 0, 1_000_000, 2 * one_day)],
    100 * one_day,
  )
  assets.lovelace_of(reserve) == 2_000_001
}

// An entry whose payouts already cover accrued + buffer reserves exactly zero —
// the `math.max(0, …)` clamp keeps an over-paid entry from producing a negative
// reserve that would offset OTHER payments' reserves in the same asset.
test reserve_clamps_overpaid_entry_at_zero() {
  let reserve = funding.calculate_streaming_reserve(
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

// Receiver cancellation may shorten a future stream exactly to start_date.
// Its lifetime total is then zero and paid_out 0 is fully settled, so the
// rounding buffer must NOT retain one unit in the wallet reserve.
test reserve_is_zero_for_settled_zero_duration_entry() {
  let zero_duration = StreamingPayment {
    ..mk_streaming_payment(0, mk_address(#"01"), 0, 86_400_000_000, one_day),
    start_date: one_day,
  }
  let reserve = funding.calculate_streaming_reserve([zero_duration], 1_000)

  assets.lovelace_of(reserve) == 0
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
    last_non_admin_payout_at: None,
  }
  // Reserve at one day = 1_000_001; the output leaves only 1_000_000.
  expect
    funding.remains_funded(
      funding.calculate_streaming_reserve(state.streaming_payments, one_day),
      assets.from_lovelace(2_000_000),
      assets.from_lovelace(1_000_000),
    )
}

// Fuzzed payment over the domain `shape.is_valid` admits (non-negative
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
  let reserve = funding.calculate_streaming_reserve(
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
  let reserve = funding.calculate_streaming_reserve([payment], at_time)
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
  let earlier = funding.calculate_streaming_reserve([payment], at_time)
  let later = funding.calculate_streaming_reserve([payment], at_time + extra)
  assets.lovelace_of(later) >= assets.lovelace_of(earlier)
}
