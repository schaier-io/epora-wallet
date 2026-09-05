//// Repeatable final-beneficiary classification for the wallet validator.

use aiken/collection/list
use state/types.{State}

/// The final beneficiary stays in State after each withdrawal. This lets it
/// recover separate wallet UTxOs through separate transactions.
pub fn is_repeatable_beneficiary_recovery(state: State) -> Bool {
  list.length(state.access.beneficiaries) == 1
}
