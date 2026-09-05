//// Transaction-list limits shared by the STT and wallet validators.

use aiken/collection/list
use cardano/transaction.{Transaction}
use constants

/// Bound every transaction collection that the validators scan.
pub fn is_bounded(transaction: Transaction) -> Bool {
  and {
    (list.length(transaction.inputs) <= constants.max_transaction_inputs)?,
    (list.length(transaction.outputs) <= constants.max_transaction_outputs)?,
    (list.length(transaction.extra_signatories) <= constants.max_transaction_signatories)?,
    (list.length(transaction.redeemers) <= constants.max_transaction_redeemers)?,
  }
}

/// Governance permits one STT spend and one wallet purpose.
pub fn governance_is_bounded(transaction: Transaction) -> Bool {
  and {
    is_bounded(transaction)?,
    (list.length(transaction.redeemers) <= constants.max_governance_transaction_redeemers)?,
  }
}
