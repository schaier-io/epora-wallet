//// Repeatable final-beneficiary classification tests.

use state/types as state_types
use test_support/state_builders as states
use wallet/terminal_recovery

fn sole_beneficiary_state() -> state_types.State {
  states.base_state()
    |> states.with_beneficiaries(
        [states.default_beneficiary(7, "beneficiary", Some(100))],
      )
    |> states.with_proof_of_life(100, 50)
}

test sole_beneficiary_is_repeatable() {
  terminal_recovery.is_repeatable_beneficiary_recovery(sole_beneficiary_state())
}

test sole_beneficiary_with_signable_admin_is_still_repeatable() {
  let state = sole_beneficiary_state()
    |> states.with_users([states.admin_user("admin")])
  terminal_recovery.is_repeatable_beneficiary_recovery(state)
}

test two_beneficiaries_are_not_repeatable() {
  let state = sole_beneficiary_state()
    |> states.with_beneficiaries(
        [
          states.default_beneficiary(7, "beneficiary", Some(100)),
          states.default_beneficiary(8, "beneficiary-2", Some(100)),
        ],
      )
  !terminal_recovery.is_repeatable_beneficiary_recovery(state)
}
