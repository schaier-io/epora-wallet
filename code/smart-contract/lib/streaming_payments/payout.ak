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
use numeric_bounds
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment} as streaming_payment_type
use time/bounds

/// Validate one payout transition and return its exact wallet value change.
/// Output entries must form an ordered subsequence of input entries. The walk
/// therefore proves that payout cannot add, duplicate, or reorder a stream.
/// Input ids are unique under the State invariant checked at mint and addition.
pub fn validated_value_change(
  stt_input_reference: OutputReference,
  outputs: List<Output>,
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  validity_range: ValidityRange,
) -> Option<assets.Value> {
  when bounds.finite_range(validity_range) is {
    Some((tx_earliest_time, _tx_latest_time)) ->
      ordered_value_change(
        stt_input_reference,
        outputs,
        input_streaming_payments,
        output_streaming_payments,
        tx_earliest_time,
        assets.zero,
      )
    None -> None
  }
}

fn ordered_value_change(
  stt_input_reference: OutputReference,
  outputs: List<Output>,
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  tx_earliest_time: Int,
  value_change: assets.Value,
) -> Option<assets.Value> {
  when input_streaming_payments is {
    [] ->
      when output_streaming_payments is {
        [] -> Some(value_change)
        _ -> None
      }
    [input_streaming_payment, ..remaining_inputs] ->
      when output_streaming_payments is {
        [output_streaming_payment, ..remaining_outputs] ->
          if input_streaming_payment.id == output_streaming_payment.id {
            when
              retained_streaming_payment_change(
                input_streaming_payment,
                output_streaming_payment,
                outputs,
                stt_input_reference,
                tx_earliest_time,
              )
            is {
              Some(change) ->
                value_change_then_continue(
                  stt_input_reference,
                  outputs,
                  input_streaming_payment,
                  remaining_inputs,
                  remaining_outputs,
                  tx_earliest_time,
                  value_change,
                  change,
                )
              None -> None
            }
          } else {
            removed_streaming_payment_change_then_continue(
              stt_input_reference,
              outputs,
              input_streaming_payment,
              remaining_inputs,
              output_streaming_payments,
              tx_earliest_time,
              value_change,
            )
          }
        [] ->
          removed_streaming_payment_change_then_continue(
            stt_input_reference,
            outputs,
            input_streaming_payment,
            remaining_inputs,
            output_streaming_payments,
            tx_earliest_time,
            value_change,
          )
      }
  }
}

fn removed_streaming_payment_change_then_continue(
  stt_input_reference: OutputReference,
  outputs: List<Output>,
  input_streaming_payment: StreamingPayment,
  remaining_inputs: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  tx_earliest_time: Int,
  value_change: assets.Value,
) -> Option<assets.Value> {
  when
    removed_streaming_payment_change(
      input_streaming_payment,
      outputs,
      stt_input_reference,
      tx_earliest_time,
    )
  is {
    Some(change) ->
      value_change_then_continue(
        stt_input_reference,
        outputs,
        input_streaming_payment,
        remaining_inputs,
        output_streaming_payments,
        tx_earliest_time,
        value_change,
        change,
      )
    None -> None
  }
}

// Add one stream's value change and continue the ordered walk. The persistent
// schedule cap bounds this traversal. The ledger decides how many payout
// outputs fit in one transaction.
fn value_change_then_continue(
  stt_input_reference: OutputReference,
  outputs: List<Output>,
  input_streaming_payment: StreamingPayment,
  remaining_inputs: List<StreamingPayment>,
  remaining_outputs: List<StreamingPayment>,
  tx_earliest_time: Int,
  value_change: assets.Value,
  change: Int,
) -> Option<assets.Value> {
  ordered_value_change(
    stt_input_reference,
    outputs,
    remaining_inputs,
    remaining_outputs,
    tx_earliest_time,
    assets.add(
      value_change,
      input_streaming_payment.policy_id,
      input_streaming_payment.asset_name,
      change,
    ),
  )
}

// A streaming payment KEPT in the output state: its paid-out change must be a
// valid partial payout, and (when non-zero) routed to a correctly-tagged output.
fn retained_streaming_payment_change(
  input_streaming_payment: StreamingPayment,
  output_streaming_payment: StreamingPayment,
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  tx_earliest_time: Int,
) -> Option<Int> {
  if input_streaming_payment == output_streaming_payment {
    // An unchanged entry needs no payout output. It must still owe value;
    // otherwise a fully settled or zero-lifetime entry could remain forever.
    if input_streaming_payment.paid_out_amount < funding.lifetime_total(
      input_streaming_payment,
    ) {
      Some(0)
    } else {
      None
    }
  } else {
    when
      valid_requested_payout_change(
        input_streaming_payment,
        output_streaming_payment,
        tx_earliest_time,
      )
    is {
      Some(requested_change) ->
        if output_with_streaming_payment_id_matches(
          outputs,
          stt_input_reference,
          requested_change,
          input_streaming_payment,
        ) {
          Some(requested_change)
        } else {
          None
        }
      None -> None
    }
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
// nor REMOVED (not yet matured). Because `validated_value_change` checks every input
// entry, one such payment would wedge the crank for the whole
// wallet until its `end_date`. This state is reachable at mint (`shape.is_valid`
// accepts `paid_out_amount == lifetime_total` non-strictly, and a sub-day-unit
// schedule has `lifetime_total == 0`) and via a fully-accrued reschedule.
// Removing a fully-settled entry moves no value:
// `lifetime_total - paid_out_amount = 0`.
fn removed_streaming_payment_change(
  input_streaming_payment: StreamingPayment,
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  tx_earliest_time: Int,
) -> Option<Int> {
  let lifetime_total_amount = funding.lifetime_total(input_streaming_payment)
  let entry_has_matured = input_streaming_payment.end_date <= tx_earliest_time
  let entry_fully_settled = input_streaming_payment.paid_out_amount >= lifetime_total_amount
  let entry_is_removable = entry_has_matured || entry_fully_settled

  // Remaining amount owed at removal: the entry's full unpaid remainder
  // (`removed_entry_remaining`). A removal is valid only for a matured or
  // fully-settled entry, where that remainder equals the accrued-but-unpaid
  // amount. The ordered walk adds this same amount to the wallet value change.
  let expected_change = removed_entry_remaining(input_streaming_payment)

  // A zero remainder needs no tagged output (mirrors the retained zero-delta
  // case); a positive remainder must reach a correctly-tagged payout output.
  let payout_output_matches = expected_change == 0 || output_with_streaming_payment_id_matches(
    outputs,
    stt_input_reference,
    expected_change,
    input_streaming_payment,
  )

  if entry_is_removable && payout_output_matches {
    Some(expected_change)
  } else {
    None
  }
}

// Fields a streaming-payment payout MUST preserve: the always-immutable core
// (`types.core_fields_match`) plus `end_date`. Only `paid_out_amount` may change
// between input and output.
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
///      removed through `removed_streaming_payment_change`, which settles the
///      full remainder. A fully-paid entry is therefore never retained. This
///      guard lives only here on the payout path, not in
///      `shape.is_valid`.
fn valid_requested_payout_change(
  input_streaming_payment: StreamingPayment,
  output_streaming_payment: StreamingPayment,
  tx_earliest_time: Int,
) -> Option<Int> {
  if numeric_bounds.is_non_negative_bounded(
    output_streaming_payment.paid_out_amount,
  ) {
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
    // removal (the `None` branch), never be kept, even with a zero-change
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
  } else {
    None
  }
}

// Unpaid remainder for a removed payment. The payout check and the ordered
// walk use this same amount for the tagged output and the wallet value change.
fn removed_entry_remaining(streaming_payment: StreamingPayment) -> Int {
  funding.lifetime_total(streaming_payment) - streaming_payment.paid_out_amount
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
//   - The `>=` cannot increase the total wallet outflow. What may leave the
//     wallet is pinned by `output_value == input_value - payout_delta` in
//     `wallet/rules.ak`. Payout routing permits the asset only at protocol or
//     correctly tagged configured outputs. If an ADA stream pays the wallet's
//     own address, its tagged output is also a wallet continuation. In that
//     case, ADA fungibility lets the exact wallet delta reach another configured
//     stream output. The total wallet outflow remains capped by the delta.
//   - On a WALLET-LESS crank (no wallet UTxO spent, so the wallet validator never
//     fires) the surplus is likewise the cranker's own money — it advances
//     `paid_out_amount` by at most `requested_change` either way, so overpaying
//     only benefits the payee at the cranker's expense.
// A future edit must not "tighten" this to `==` without also solving min-UTxO, and
// must not use it as a cap. The aggregate cap lives wallet-side.
fn output_with_streaming_payment_id_matches(
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  requested_change: Int,
  input_streaming_payment: StreamingPayment,
) -> Bool {
  list.any(
    outputs,
    fn(output) {
      if output.address != input_streaming_payment.payout_address {
        False
      } else {
        when streaming_payment_type.output_payout_tag(output) is {
          Some(output_tag) -> {
            let expected_output_id = streaming_payment_type.expected_payout_tag(
              input_streaming_payment.id,
              stt_input_reference,
            )
            // No `?` on ANY conjunct (§9): this lambda is a `list.any` scan
            // predicate, so a False is a normal miss for every non-matching
            // output, not a violation — tracing it would fire on each legitimate
            // miss and drown the signal.
            and {
              output_tag == expected_output_id,
              quantity_of(
                output.value,
                input_streaming_payment.policy_id,
                input_streaming_payment.asset_name,
              ) >= requested_change,
            }
          }
          None -> False
        }
      }
    },
  )
}
