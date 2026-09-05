//// Transaction authority-list limits shared by the STT and wallet validators.

use aiken/collection/list
use cardano/transaction.{Transaction}
use constants

/// Bound the signer set that persistent multisig configuration can require.
/// Inputs, outputs, and ordinary redeemers stay transaction-local. The ledger's
/// size and execution-unit limits decide how many fit for a particular action.
pub fn is_bounded(transaction: Transaction) -> Bool {
  list.length(transaction.extra_signatories) <= constants.max_transaction_signatories
}

/// Governance permits one STT spend and one wallet purpose.
pub fn governance_is_bounded(transaction: Transaction) -> Bool {
  and {
    is_bounded(transaction)?,
    (list.length(transaction.redeemers) <= constants.max_governance_transaction_redeemers)?,
  }
}
