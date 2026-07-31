//// Forward / reschedule transition rules for streaming payments (the
//// no-payout paths: STT forwarding and `ManageStreamingPayments`).
////
//// One audit concern: which streaming-payment rewrites are allowed when NO
//// value moves. Mint-time shape checks live in `streaming_payments/shape.ak`;
//// the settlement leg lives in `streaming_payments/payout.ak`. The
//// always-immutable field set is owned by
//// `streaming_payments/types.core_fields_match`.

use aiken/collection/list
use aiken/math
use streaming_payments/types.{StreamingPayment} as streaming_payment_type

/// `ManageStreamingPayments` rewrite rule. Every EXISTING streaming payment must
/// be forwarded / rescheduled — preserve every field except the end date, which
/// may move freely UP (extend) or DOWN to — but never below — `tx_latest_time`
/// (the tx's `invalid_hereafter` upper bound). Existing payments can never be
/// dropped or have their immutable fields / `paid_out_amount` changed via this
/// path, so an already-accrued payee can never be clawed back or erased.
///
/// In ADDITION, an operator (admin or multisig — the authority is enforced by the
/// caller, `eval_manage_streaming_payments`) may ADD brand-new streaming payments:
/// any output entry whose `id` is not in the input must be born unsettled
/// (`paid_out_amount == 0`). The whole output set's shape — the `<= 25` count cap,
/// id-uniqueness, and per-entry validity (dates, amount, no over-pay) — is
/// enforced by `shape.is_valid` at the call site, so adds stay bounded and
/// the per-asset streaming reserve (recomputed from the live State on every
/// spend) keeps covering whatever the payee set has become. Removing a payment is
/// NOT an add/remove operation here: an operator stops a payment by rescheduling
/// its `end_date` down to `tx_latest_time` (accrual stops, nothing is clawed
/// back); a payment only fully leaves the set via settlement in
/// `PayStreamingPayment`.
/// A payee-cancelled payment is terminal: its persistent `cancelled_at` marker
/// and shortened `end_date` are forwarded exactly, so management cannot resume
/// it. Fresh additions must carry `cancelled_at == None`.
///
/// Moving `end_date` down is how an operator STOPS a streaming payment's future
/// accrual ("cancel"): accrual is capped at the new `end_date`, so the stream
/// stops growing. The `end_date >= min(input.end_date, tx_latest_time)` floor is
/// the no-clawback guarantee — `tx_latest_time` is >= the slot this tx can land
/// in, which is >= the real current time, so capping at `tx_latest_time` can
/// never erase value that has ALREADY accrued; the payee keeps everything up to
/// the cap. Pure forwarding (`end_date` unchanged) and extending (`end_date` up)
/// stay valid since both satisfy the floor.
///
/// `tx_latest_time` is `None` when the tx has no finite upper bound; we then
/// cannot prove "not in the past", so only forwarding/extending is permitted for
/// existing payments (the floor degrades to `input.end_date`).
///
/// Param order is always (input_streaming_payments, output_streaming_payments,
/// tx_latest_time) — see also `are_forwarded` below.
pub fn are_forwarded_rescheduled_or_added(
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  tx_latest_time: Option<Int>,
) -> Bool {
  and {
    // Existing payees: forwarded / rescheduled only — never dropped, never
    // field-changed, never clawed back below the validity floor.
    list.all(
      input_streaming_payments,
      fn(input) {
        forwards_existing(
          input,
          output_streaming_payments,
          fn(input, output) {
            and {
              (output.cancelled_at == input.cancelled_at)?,
              when input.cancelled_at is {
                // Payee cancellation is terminal: an operator cannot resume a
                // schedule after the payee has exercised its one-shot stop.
                Some(_) -> (output.end_date == input.end_date)?
                None ->
                  (output.end_date >= operator_end_date_floor(
                    input,
                    tx_latest_time,
                  ))?
              },
            }
          },
        )
      },
    )?,
    // Every output is either an existing payee (governed above) or a fresh add,
    // which must be born unsettled. Shape/cap/uniqueness: caller `is_valid`.
    list.all(
      output_streaming_payments,
      fn(output) {
        or {
          streaming_payment_type.find_by_id(input_streaming_payments, output.id) != None,
          and {
            (output.paid_out_amount == 0)?,
            (output.cancelled_at == None)?,
          },
        }
      },
    )?,
  }
}

/// No-clawback end-date floor for a forwarded/rescheduled payment: the lesser of
/// the current end date and the tx's `invalid_hereafter`, or the current end date
/// when the tx is unbounded (then only extending is provable as "not the past").
///
/// Clamped to stay ABOVE `start_date`, so the floor can never invert a payment's
/// date order. Without the clamp, stopping a payment whose `start_date` is still
/// in the FUTURE would cap `end_date` at "now" — i.e. BELOW `start_date` —
/// producing a negative `lifetime_total` that `shape.is_valid` rejects and that
/// no settlement can retain or price. `start_date + 1` (rather than `start_date`)
/// keeps the strict active/operator-managed `start_date < end_date` invariant.
/// At very high rates that millisecond can accrue value; this is intentional
/// operator burden, not imposed on the separate payee self-cancel path.
///
/// This `start_date + 1` floor is intentionally operator-only. Operator burden
/// (including the possible 1ms accrual at very high rates) is accepted; the
/// payee path below must be able to cancel to a true zero-lifetime schedule.
fn operator_end_date_floor(
  input: StreamingPayment,
  tx_latest_time: Option<Int>,
) -> Int {
  let unclamped = when tx_latest_time is {
    Some(latest) -> math.min(input.end_date, latest)
    None -> input.end_date
  }
  math.max(input.start_date + 1, unclamped)
}

/// Exact payee-cancel cap. A pre-start cancel lands at `start_date`, producing
/// a marked zero-lifetime schedule and therefore no forced 1ms accrual.
fn payee_cancel_end_date(input: StreamingPayment, tx_latest_time: Int) -> Int {
  math.max(input.start_date, math.min(input.end_date, tx_latest_time))
}

/// Payee self-cancel rewrite rule (the `CancelStreamingPayment` path). EXACTLY the
/// streaming payment whose `id == target_id` has its `end_date` set to the
/// no-clawback floor `min(input.end_date, tx_latest_time)` — i.e. capped at "now"
/// (the tx's `invalid_hereafter` upper bound) when its end lies in the future, and
/// left untouched when it is already at/before "now". Every OTHER payment is
/// forwarded EXACTLY (all fields, `end_date` included) and the list length is
/// preserved, so a cancel can never add, drop, extend, claw back, or otherwise
/// touch any payment but the targeted one.
///
/// The target must make a persistent `None -> Some(tx_latest_time)` cancellation
/// transition and strictly shorten its end date. That marker makes the rule
/// genuinely one-shot even when a later transaction chooses a smaller upper
/// validity bound; every non-target payment preserves both fields exactly.
/// `tx_latest_time` MUST be finite — the caller unwraps the upper bound before
/// calling — because it is the "now" reference the cap is taken against; that is
/// why this takes an `Int`, not the `Option<Int>` the operator rule above accepts.
/// Unlike operator management, a pre-start payee cancel clamps to `start_date`
/// exactly. The durable marker makes that zero-lifetime shape unambiguous.
pub fn is_payee_cancelled(
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  target_id: Int,
  tx_latest_time: Int,
) -> Bool {
  preserved_with_path_fields(
    input_streaming_payments,
    output_streaming_payments,
    fn(input, output) {
      if input.id == target_id {
        and {
          (input.cancelled_at == None)?,
          (output.cancelled_at == Some(tx_latest_time))?,
          (output.end_date == payee_cancel_end_date(input, tx_latest_time))?,
          (output.end_date < input.end_date)?,
        }
      } else {
        and {
          (output.cancelled_at == input.cancelled_at)?,
          (output.end_date == input.end_date)?,
        }
      }
    },
  )
}

/// Forwarded streaming_payments must preserve every field exactly. Param order is
/// always (input_streaming_payments, output_streaming_payments).
pub fn are_forwarded(
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
) -> Bool {
  preserved_with_path_fields(
    input_streaming_payments,
    output_streaming_payments,
    fn(input, output) {
      and {
        (output.cancelled_at == input.cancelled_at)?,
        (output.end_date == input.end_date)?,
      }
    },
  )
}

/// Shared field-preservation check behind both forwarding paths above. Matched
/// by `id`: every always-immutable field (`types.core_fields_match`)
/// plus `paid_out_amount` must be preserved between input and output; the
/// `end_date` rule is supplied by the caller. The full field set lives in
/// `types.core_fields_match` — add an always-immutable field there.
fn preserved_with_path_fields(
  input_streaming_payments: List<StreamingPayment>,
  output_streaming_payments: List<StreamingPayment>,
  path_fields_are_valid: fn(StreamingPayment, StreamingPayment) -> Bool,
) -> Bool {
  and {
    (list.length(output_streaming_payments) == list.length(
      input_streaming_payments,
    ))?,
    list.all(
      input_streaming_payments,
      fn(input) {
        forwards_existing(
          input,
          output_streaming_payments,
          path_fields_are_valid,
        )
      },
    )?,
  }
}

/// True when some output carries `input` forward: same `id`, all immutable core
/// fields (`types.core_fields_match`) and `paid_out_amount` preserved, with the
/// `end_date` rule supplied by the caller. The single definition behind every
/// forwarding path — exact preservation, reschedule, and the add path's
/// existing-payee leg — so a payee's protected fields cannot drift between them.
fn forwards_existing(
  input: StreamingPayment,
  output_streaming_payments: List<StreamingPayment>,
  path_fields_are_valid: fn(StreamingPayment, StreamingPayment) -> Bool,
) -> Bool {
  list.find(
    output_streaming_payments,
    fn(output) {
      // Partial §9 exemption: no `?` on the id, because `find` legitimately
      // scans past non-matching ids. The remaining conjuncts only run on the
      // id-matched candidate, so a False there IS the violation and is traced.
      and {
        output.id == input.id,
        streaming_payment_type.core_fields_match(input, output)?,
        (output.paid_out_amount == input.paid_out_amount)?,
        path_fields_are_valid(input, output)?,
      }
    },
  ) != None
}
