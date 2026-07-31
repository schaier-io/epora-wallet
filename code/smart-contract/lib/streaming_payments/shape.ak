//// Static-shape validation for the streaming-payment list.
////
//// One audit concern: what may enter the chain. Runs whenever a
//// streaming-payment set is accepted on-chain — at mint (`eval_mint`) and on
//// every `ManageStreamingPayments` rewrite, which may add entries
//// (`eval_manage_streaming_payments`); the per-spend transition rules live in
//// `streaming_payments/payout.ak` (settlement) and
//// `streaming_payments/forwarding.ak` (forward/reschedule/add).

use aiken/collection/list
use assets/identity as asset_identity
use constants
use state/credentials as credential_shape
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment} as streaming_payment_type

/// Validate the static shape of a streaming_payment list before it is accepted on-chain.
pub fn is_valid(streaming_payments: List<StreamingPayment>) -> Bool {
  and {
    // Cap the record count so a spend that scans every payment (payout, reserve)
    // stays within the per-tx execution budget. This runs at mint and on every
    // add via `ManageStreamingPayments`, so the cap bounds the set however it grew.
    (list.length(streaming_payments) <= constants.max_streaming_payments)?,
    streaming_payment_type.ids_are_unique(streaming_payments)?,
    list.all(
      streaming_payments,
      fn(streaming_payment) {
        // Cannot be born over-paid: paid_out never exceeds the lifetime total.
        // Non-strict, so a fully-accrued reschedule (end_date -> tx_latest)
        // still passes; only an entry born genuinely over-paid (at mint — a
        // manage-add is pinned to paid_out == 0 by the forwarding rule) is
        // rejected. Keeps the removal-branch payout delta non-negative.
        let not_overpaid_at_mint = streaming_payment.paid_out_amount <= funding.lifetime_total(
          streaming_payment,
        )
        let cancellation_stamp_is_valid = when
          streaming_payment.cancelled_at
        is {
          Some(cancelled_at) -> cancelled_at >= 0
          None -> True
        }
        let date_order_is_valid = if streaming_payment.start_date < streaming_payment.end_date {
          True
        } else {
          streaming_payment.start_date == streaming_payment.end_date && streaming_payment.cancelled_at != None
        }
        and {
          (streaming_payment.start_date >= 0)?,
          (streaming_payment.end_date >= 0)?,
          (streaming_payment.amount_per_day >= 0)?,
          (streaming_payment.paid_out_amount >= 0)?,
          date_order_is_valid?,
          asset_identity.is_valid(
            streaming_payment.policy_id,
            streaming_payment.asset_name,
          )?,
          credential_shape.address_is_valid(streaming_payment.payout_address)?,
          cancellation_stamp_is_valid?,
          not_overpaid_at_mint?,
        }
      },
    )?,
  }
}

/// Freshly created schedules cannot forge the persistent cancellation marker.
/// Used by STT mint; post-mint additions are pinned independently by the
/// forwarding rule so an existing cancelled schedule can still be preserved.
pub fn none_are_cancelled(streaming_payments: List<StreamingPayment>) -> Bool {
  list.all(
    streaming_payments,
    fn(streaming_payment) { streaming_payment.cancelled_at == None },
  )
}
