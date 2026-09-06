//// Governance-purpose limits shared by the STT and wallet validators.

use aiken/collection/list
use cardano/transaction.{Transaction}
use constants

/// Governance permits one STT spend and one wallet purpose.
pub fn governance_is_bounded(transaction: Transaction) -> Bool {
  list.length(transaction.redeemers) <= constants.max_governance_transaction_redeemers
}
