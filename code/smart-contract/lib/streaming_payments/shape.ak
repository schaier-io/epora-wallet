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
use numeric_bounds
use state/credentials as credential_shape
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment} as streaming_payment_type

/// Validate the static shape of a streaming_payment list before it is accepted on-chain.
pub fn is_valid(streaming_payments: List<StreamingPayment>) -> Bool {
  and {
    // Cap the record count to bound every payout and reserve scan. The repository
    // budget gate measures named maximum-shape fixtures. This check runs at mint
    // and on every add, so the cap bounds the set however it grew.
    (list.length(streaming_payments) <= constants.max_streaming_payments)?,
    streaming_payment_type.ids_are_unique(streaming_payments)?,
    list.all(
      streaming_payments,
      fn(streaming_payment) {
        let scalars_are_bounded = and {
          numeric_bounds.is_bounded(streaming_payment.id)?,
          numeric_bounds.is_non_negative_bounded(streaming_payment.start_date)?,
          numeric_bounds.is_non_negative_bounded(streaming_payment.end_date)?,
          numeric_bounds.is_non_negative_bounded(
            streaming_payment.amount_per_day,
          )?,
          numeric_bounds.is_non_negative_bounded(
            streaming_payment.paid_out_amount,
          )?,
          (streaming_payment.start_date <= streaming_payment.end_date)?,
        }
        if scalars_are_bounded {
          // A schedule must fit the scalar cap for its full lifetime. Otherwise
          // `paid_out_amount` could never reach the amount needed for removal.
          let lifetime_total = funding.lifetime_total(streaming_payment)
          and {
            (lifetime_total <= constants.max_state_integer)?,
            (streaming_payment.paid_out_amount <= lifetime_total)?,
            asset_identity.is_valid(
              streaming_payment.policy_id,
              streaming_payment.asset_name,
            )?,
            credential_shape.address_is_valid(streaming_payment.payout_address)?,
          }
        } else {
          False
        }
      },
    )?,
  }
}

/// Fresh schedules accepted at wallet mint must start unsettled and have a
/// positive duration. The general shape deliberately allows `start_date ==
/// end_date`: receiver cancellation can safely create that zero-duration form, and
/// later forwarding/configuration must not brick the State that contains it.
pub fn fresh_are_valid(streaming_payments: List<StreamingPayment>) -> Bool {
  list.all(
    streaming_payments,
    fn(streaming_payment) {
      and {
        (streaming_payment.paid_out_amount == 0)?,
        (streaming_payment.start_date < streaming_payment.end_date)?,
      }
    },
  )
}
