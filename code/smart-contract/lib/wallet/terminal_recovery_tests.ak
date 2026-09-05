//// Terminal beneficiary-recovery classification tests.

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

test sole_beneficiary_without_operator_path_is_terminal() {
  terminal_recovery.is_terminal_beneficiary_recovery(sole_beneficiary_state())
}

test sole_beneficiary_with_signable_admin_is_not_terminal() {
  let state = sole_beneficiary_state()
    |> states.with_users([states.admin_user("admin")])
  !terminal_recovery.is_terminal_beneficiary_recovery(state)
}

test sole_beneficiary_with_satisfiable_multisig_is_not_terminal() {
  let state = sole_beneficiary_state()
    |> states.with_users(
        [
          states.multisig_user(1, "signer1", 1),
          states.multisig_user(2, "signer2", 1),
        ],
      )
    |> states.with_multisig_threshold(2)
  !terminal_recovery.is_terminal_beneficiary_recovery(state)
}
