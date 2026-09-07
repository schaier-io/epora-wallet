//// Input evidence for the asset of each newly added streaming payment.

use aiken/collection/list
use cardano/assets
use cardano/transaction.{Input}
use streaming_payments/types.{StreamingPayment, find_by_id}

/// Each fresh id requires a positive quantity of its exact asset in a consumed
/// or reference input. At mint, the previous payment list is empty.
/// Any input address may supply evidence. This proves existence at creation,
/// not wallet funding or future availability. See "Streaming asset existence"
/// in the whitepaper's Limitations and Trust Assumptions.
pub fn new_assets_are_present(
  previous_payments: List<StreamingPayment>,
  current_payments: List<StreamingPayment>,
  inputs: List<Input>,
  reference_inputs: List<Input>,
) -> Bool {
  list.all(
    current_payments,
    fn(payment) {
      or {
        find_by_id(previous_payments, payment.id) != None,
        list.any(inputs, fn(input) { contains_asset(input, payment) }),
        list.any(reference_inputs, fn(input) { contains_asset(input, payment) }),
      }
    },
  )
}

fn contains_asset(input: Input, payment: StreamingPayment) -> Bool {
  assets.quantity_of(input.output.value, payment.policy_id, payment.asset_name) > 0
}
