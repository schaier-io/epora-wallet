//// Terminal beneficiary-recovery classification for the wallet validator.

use aiken/collection/list
use state/types.{State, User}

fn user_has_wallet(user: User) -> Bool {
  list.length(user.user_wallets) > 0
}

fn has_reachable_multisig(state: State) -> Bool {
  when state.access.multi_sig_threshold is {
    Some(required_power) -> {
      let available_power = list.foldl(
        state.access.users,
        0,
        fn(user, total) {
          when user.multi_sig_power is {
            Some(power) ->
              if power > 0 && user_has_wallet(user) {
                total + power
              } else {
                total
              }
            None -> total
          }
        },
      )
      required_power > 0 && available_power >= required_power
    }
    None -> False
  }
}

/// True only when removing the sole beneficiary also removes the final admin,
/// multisig, or beneficiary path. Limited user actions can still remain.
pub fn is_terminal_beneficiary_recovery(state: State) -> Bool {
  let has_signable_admin = list.any(
    state.access.users,
    fn(user) { user.is_admin && user_has_wallet(user) },
  )
  list.length(state.access.beneficiaries) == 1 && !has_signable_admin && !has_reachable_multisig(
    state,
  )
}
