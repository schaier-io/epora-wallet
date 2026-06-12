//// Static-shape validation for the streaming-payment list.
////
//// One audit concern: what may enter the chain. Runs whenever a
//// streaming-payment set is accepted on-chain — at mint (`eval_mint`) and on
//// every `ManageStreamingPayments` rewrite, which may add entries
//// (`eval_manage_streaming_payments`); the per-spend transition rules live in
//// `streaming_payments/payout.ak` (settlement) and
//// `streaming_payments/forwarding.ak` (forward/reschedule/add).

use aiken/collection/list
use constants
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment}

// Validate the static shape of a streaming_payment list before it is accepted on-chain.
pub fn expect_valid(streaming_payments: List<StreamingPayment>) {
  let streaming_payment_ids = list.map(
    streaming_payments,
    fn(streaming_payment) { streaming_payment.id },
  )
  and {
    // Cap the record count so a spend that scans every payment (payout, reserve)
    // stays within the per-tx execution budget. This runs at mint and on every
    // add via `ManageStreamingPayments`, so the cap bounds the set however it grew.
    list.length(streaming_payments) <= constants.max_streaming_payments,
    list.length(list.unique(streaming_payment_ids)) == list.length(
      streaming_payments,
    ),
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
        and {
          streaming_payment.start_date >= 0,
          streaming_payment.end_date >= 0,
          streaming_payment.amount_per_day >= 0,
          streaming_payment.paid_out_amount >= 0,
          streaming_payment.start_date < streaming_payment.end_date,
          not_overpaid_at_mint,
        }
      },
    ),
  }
}
