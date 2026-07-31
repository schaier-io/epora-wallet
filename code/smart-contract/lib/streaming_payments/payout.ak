//// Payout-path transition rules for streaming payments (the settlement leg of
//// `PayStreamingPayment`).
////
//// One audit concern: how a payout may rewrite the streaming-payment list and
//// what tagged outputs it must emit. Mint-time shape checks live in
//// `streaming_payments/shape.ak`; the forward/reschedule (no-payout) path lives
//// in `streaming_payments/forwarding.ak`. The always-immutable field set is
//// owned by `streaming_payments/types.core_fields_match`.

use aiken/collection/list
use aiken/math
use cardano/assets.{quantity_of}
use cardano/transaction.{Output, OutputReference, ValidityRange}
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment} as streaming_payment_type
use time/bounds

/// Streaming-payment payout can only touch existing entries and must match tagged payout outputs.
pub fn payout_is_valid(
  stt_input_reference: OutputReference,
  outputs: List<Output>,
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  validity_range: ValidityRange,
) -> Bool {
  and {
    streaming_payment_type.ids_are_unique(output_streaming_payments)?,
    streaming_payments_only_change_existing_entries(
      input_streaming_payments,
      output_streaming_payments,
    )?,
    streaming_payment_changes_match_payout_outputs(
      stt_input_reference,
      outputs,
      input_streaming_payments,
      output_streaming_payments,
      validity_range,
    )?,
  }
}

// Streaming-payment payout cannot introduce brand-new streaming-payment ids.
fn streaming_payments_only_change_existing_entries(
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
) -> Bool {
  list.all(
    output_streaming_payments,
    fn(output_streaming_payment) {
      let exists_in_input = streaming_payment_type.find_by_id(
        input_streaming_payments,
        output_streaming_payment.id,
      ) != None
      exists_in_input?
    },
  )
}

// Every changed streaming_payment must request a valid payout delta and emit a matching tagged payout output.
fn streaming_payment_changes_match_payout_outputs(
  stt_input_reference: OutputReference,
  outputs: List<Output>,
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  validity_range: ValidityRange,
) -> Bool {
  // A finite upper bound is still REQUIRED: `finite_range` returns `Some` only
  // when both ends are finite, so an open-ended `until +inf` tx is rejected
  // outright and can never authorize a payout. Only `tx_earliest` feeds the
  // payout math, though — it is the accrued-so-far floor, and maturity is also
  // measured against it (`removed_streaming_payment_change_valid`), so the upper
  // bound is intentionally not threaded further down.
  when bounds.finite_range(validity_range) is {
    Some((tx_earliest_time, _tx_latest_time)) ->
      list.all(
        input_streaming_payments,
        fn(input_streaming_payment) {
          streaming_payment_change_matches_payout_output(
            stt_input_reference,
            outputs,
            input_streaming_payment,
            output_streaming_payments,
            tx_earliest_time,
          )
        },
      )
    None -> False
  }
}

// Validate the payout delta requested for one streaming_payment and match it to a tagged output.
fn streaming_payment_change_matches_payout_output(
  stt_input_reference: OutputReference,
  outputs: List<Output>,
  input_streaming_payment: StreamingPayment,
  output_streaming_payments: List<StreamingPayment>,
  tx_earliest_time: Int,
) -> Bool {
  let matching_output = streaming_payment_type.find_by_id(
    output_streaming_payments,
    input_streaming_payment.id,
  )

  when matching_output is {
    // Still present in the output state → a (possibly zero) partial payout.
    Some(output_streaming_payment) ->
      retained_streaming_payment_change_valid(
        input_streaming_payment,
        output_streaming_payment,
        outputs,
        stt_input_reference,
        tx_earliest_time,
      )
    // Removed from the output state → must be a matured, fully-settled payment.
    None ->
      removed_streaming_payment_change_valid(
        input_streaming_payment,
        outputs,
        stt_input_reference,
        tx_earliest_time,
      )
  }
}

// A streaming payment KEPT in the output state: its paid-out change must be a
// valid partial payout, and (when non-zero) routed to a correctly-tagged output.
fn retained_streaming_payment_change_valid(
  input_streaming_payment: StreamingPayment,
  output_streaming_payment: StreamingPayment,
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  tx_earliest_time: Int,
) -> Bool {
  when
    valid_requested_payout_change(
      input_streaming_payment,
      output_streaming_payment,
      tx_earliest_time,
    )
  is {
    // A zero delta moves no value, so it needs no tagged output — otherwise
    // settling one payment out of many would force a placeholder output to
    // every other payment's address. `valid_requested_payout_change` has already
    // confirmed the immutable fields are preserved, so a zero-delta entry is safe.
    Some(requested_change) ->
      requested_change == 0 || output_with_streaming_payment_id_matches(
        outputs,
        stt_input_reference,
        requested_change,
        input_streaming_payment,
      )?
    None -> False
  }
}

// A streaming payment REMOVED from the output state: it must owe nothing
// further — either it has MATURED (`end_date` reached, so accrual has stopped at
// `lifetime_total`) or it is already FULLY SETTLED (`paid_out_amount` has reached
// `lifetime_total`). A matured entry pays out its full remaining amount; a
// fully-settled early removal owes 0.
//
// The fully-settled escape hatch closes audit finding L1: an entry whose
// `paid_out_amount` equals its (possibly floor-rounded or zero) `lifetime_total`
// while its `end_date` is still in the future could otherwise be neither
// RETAINED (a retained entry must still owe — see `retained_entry_still_owes`)
// nor REMOVED (not yet matured). Because `payout_is_valid` runs over EVERY input
// entry, one such payment would wedge the crank for the whole
// wallet until its `end_date`. This state is reachable at mint (`shape.is_valid`
// accepts `paid_out_amount == lifetime_total` non-strictly, and a sub-day-unit
// schedule has `lifetime_total == 0`) and via a fully-accrued reschedule.
// Removing a fully-settled entry moves no value (`total_value_change` is
// `lifetime_total - paid_out_amount = 0`), so it is always safe.
fn removed_streaming_payment_change_valid(
  input_streaming_payment: StreamingPayment,
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  tx_earliest_time: Int,
) -> Bool {
  let lifetime_total_amount = funding.lifetime_total(input_streaming_payment)
  let entry_has_matured = input_streaming_payment.end_date <= tx_earliest_time
  let entry_fully_settled = input_streaming_payment.paid_out_amount >= lifetime_total_amount
  let entry_is_removable = entry_has_matured || entry_fully_settled

  // Remaining amount owed at removal: the entry's full unpaid remainder
  // (`removed_entry_remaining`). A removal is valid only for a matured or
  // fully-settled entry, where that remainder equals the accrued-but-unpaid
  // amount AND is the exact value `total_value_change` moves for this entry, so
  // sharing one definition keeps the required tagged-output amount and the
  // declared wallet-outflow delta from ever disagreeing.
  let expected_change = removed_entry_remaining(input_streaming_payment)

  // A zero remainder needs no tagged output (mirrors the retained zero-delta
  // case); a positive remainder must reach a correctly-tagged payout output.
  let payout_output_matches = expected_change == 0 || output_with_streaming_payment_id_matches(
    outputs,
    stt_input_reference,
    expected_change,
    input_streaming_payment,
  )

  and {
    entry_is_removable?,
    payout_output_matches?,
  }
}

// Fields a streaming-payment payout MUST preserve: the always-immutable core
// (`types.core_fields_match`) plus `end_date` (a payout settles accrual, it does
// not reschedule). Only `paid_out_amount` may change between input and output.
fn streaming_payment_immutable_fields_match(
  input: StreamingPayment,
  output: StreamingPayment,
) -> Bool {
  and {
    streaming_payment_type.core_fields_match(input, output)?,
    (output.end_date == input.end_date)?,
  }
}

/// Validate the requested change in `paid_out_amount` against the elapsed
/// time and end_date semantics. Returns `Some(delta)` when the change is
/// valid; `None` otherwise.
///
/// Rules (must all hold):
///   1. Immutable streaming-payment fields are preserved.
///   2. `paid_out_amount` is monotonic (cannot decrease).
///   3. The requested change does not exceed the time-elapsed maximum
///      (`max_change`), capped at the streaming_payment's end_date.
///   4. A retained entry may take any payout from `0` up to `max_change`, but
///      its `paid_out_amount` must stay strictly below the lifetime total. The
///      moment it would reach the total the payment is fully settled and is
///      finalized by REMOVAL (the `None` branch in
///      `streaming_payment_change_matches_payout_output`), which settles the
///      full remainder. A fully-paid entry is therefore never retained. This
///      guard lives only here on the payout path, not in
///      `shape.is_valid`.
fn valid_requested_payout_change(
  input_streaming_payment: StreamingPayment,
  output_streaming_payment: StreamingPayment,
  tx_earliest_time: Int,
) -> Option<Int> {
  let max_change = math.max(
    0,
    funding.accrued_at(input_streaming_payment, tx_earliest_time) - input_streaming_payment.paid_out_amount,
  )
  let requested_change = output_streaming_payment.paid_out_amount - input_streaming_payment.paid_out_amount

  let immutable_fields_ok = streaming_payment_immutable_fields_match(
    input_streaming_payment,
    output_streaming_payment,
  )
  let paid_out_amount_monotonic = output_streaming_payment.paid_out_amount >= input_streaming_payment.paid_out_amount
  // `within_max_change` caps a retained payout at the elapsed maximum (measured
  // from `tx_earliest_time`); the tx upper bound is intentionally not consulted.
  let within_max_change = requested_change <= max_change
  // ...but a retained entry must still owe something: once `paid_out_amount`
  // reaches the lifetime total the payment is fully settled and MUST go through
  // removal (the `None` branch), never be kept — not even with a zero-change
  // retain. Enforced only here on the payout path.
  let lifetime_total_amount = funding.lifetime_total(input_streaming_payment)
  let retained_entry_still_owes = output_streaming_payment.paid_out_amount < lifetime_total_amount

  if and {
    immutable_fields_ok?,
    paid_out_amount_monotonic?,
    within_max_change?,
    retained_entry_still_owes?,
  } {
    Some(requested_change)
  } else {
    None
  }
}

// The value a removed (settled-and-dropped) streaming payment pays out: its full
// unpaid remainder. THE single definition shared by the removal validity check
// (`removed_streaming_payment_change_valid`) and the value accounting
// (`streaming_payment_value_change`), so the tagged-output amount the STT
// requires and the wallet-outflow delta it declares can never diverge. A removal
// is valid only for a matured or fully-settled entry, and `shape.is_valid`
// guarantees `paid_out_amount <= lifetime_total`, so this is always >= 0.
fn removed_entry_remaining(streaming_payment: StreamingPayment) -> Int {
  funding.lifetime_total(streaming_payment) - streaming_payment.paid_out_amount
}

/// Sum the wallet value delta implied by all changed or removed streaming_payments.
pub fn total_value_change(
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
) -> assets.Value {
  list.foldl(
    input_streaming_payments,
    assets.zero,
    fn(input_streaming_payment, acc) {
      assets.merge(
        acc,
        streaming_payment_value_change(
          input_streaming_payment,
          output_streaming_payments,
        ),
      )
    },
  )
}

// Convert the payout delta for one streaming_payment into the corresponding wallet value change.
fn streaming_payment_value_change(
  input_streaming_payment: StreamingPayment,
  output_streaming_payments: List<StreamingPayment>,
) -> assets.Value {
  let matching_output = streaming_payment_type.find_by_id(
    output_streaming_payments,
    input_streaming_payment.id,
  )

  when matching_output is {
    Some(output_streaming_payment) -> {
      let changed_amount = output_streaming_payment.paid_out_amount - input_streaming_payment.paid_out_amount
      assets.from_asset(
        input_streaming_payment.policy_id,
        input_streaming_payment.asset_name,
        changed_amount,
      )
    }
    None -> {
      let remaining_payout = removed_entry_remaining(input_streaming_payment)
      assets.from_asset(
        input_streaming_payment.policy_id,
        input_streaming_payment.asset_name,
        remaining_payout,
      )
    }
  }
}

// Match a payout output by its tagged streaming_payment id and asset amount.
//
// WHY `>=` AND NOT `==` (verified, security review 2026-07). This is a per-stream
// FLOOR, not an equality, and both directions matter:
//   - It cannot be `==`. For an ADA stream the payee output must clear min-UTxO,
//     which is normally far above a single settlement's delta, so an exact-delta
//     output would be unconstructible. The cranker tops the output up with its OWN
//     ada (see `wallet/payout_routing.ak` conjunct (3), which is `>=` for lovelace
//     and `==` for every token for exactly this reason).
//   - The `>=` cannot be exploited to drain the wallet. It bounds only what may
//     LAND here; what may LEAVE the wallet is pinned elsewhere and exactly:
//     `paid_out_value == payout_delta` in `wallet/rules.ak` fixes the wallet's net
//     outflow to the declared delta, and `assets_only_reach_matching_outputs`
//     forbids the payout asset from reaching any non-payee output. So any surplus
//     above `requested_change` is provably cranker-funded, never wallet-funded.
//   - On a WALLET-LESS crank (no wallet UTxO spent, so the wallet validator never
//     fires) the surplus is likewise the cranker's own money — it advances
//     `paid_out_amount` by at most `requested_change` either way, so overpaying
//     only benefits the payee at the cranker's expense.
// A future edit must not "tighten" this to `==` without also solving min-UTxO, and
// must not lean on it as a cap — the cap lives wallet-side.
fn output_with_streaming_payment_id_matches(
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  requested_change: Int,
  input_streaming_payment: StreamingPayment,
) -> Bool {
  list.any(
    outputs,
    fn(output) {
      when streaming_payment_type.output_payout_tag(output) is {
        Some(output_tag) -> {
          let expected_output_id = streaming_payment_type.expected_payout_tag(
            input_streaming_payment.id,
            stt_input_reference,
          )
          let asset_output = quantity_of(
            output.value,
            input_streaming_payment.policy_id,
            input_streaming_payment.asset_name,
          )
          // No `?` on ANY conjunct (§9): this lambda is a `list.any` scan
          // predicate, so a False is a normal miss for every non-matching
          // output, not a violation — tracing it would fire on each legitimate
          // miss and drown the signal.
          and {
            output.address == input_streaming_payment.payout_address,
            output_tag == expected_output_id,
            asset_output >= requested_change,
          }
        }
        None -> False
      }
    },
  )
}
