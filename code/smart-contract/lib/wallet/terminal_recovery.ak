//// Repeatable final-beneficiary classification for the wallet validator.

use aiken/collection/list
use state/types.{State}

/// The final beneficiary stays in State after each withdrawal. It can recover
/// one or more wallet UTxOs in each transaction and retry for any remainder.
pub fn is_repeatable_beneficiary_recovery(state: State) -> Bool {
  list.length(state.access.beneficiaries) == 1
}
