//// Action-level signature/authority checks for the allowance and proof-of-life
//// spend handlers. Extracted from `validators/stt.ak` so the validator keeps the
//// per-action decision flow and this module owns the "who must have signed"
//// predicates.

use aiken/collection/list
use cardano/transaction.{Transaction, ValidityRange}
use state/proof_of_life
use state/types as state_types
use stt/preservation.{state_unchanged_except_users_and_pol_unlock_time}

// Allowance updates can only be signed by the user whose allowance changed.
pub fn allowance_updates_are_signed_by_changed_user(
  transaction: Transaction,
  allowance_updates: List<state_types.AllowanceUpdate>,
) -> Bool {
  when allowance_updates is {
    [allowance_update] ->
      list.any(
        allowance_update.changed_user_wallets,
        fn(wallet) { list.has(transaction.extra_signatories, wallet) },
      )
    _ -> False
  }
}

// Allowance updates may optionally renew proof-of-live, but only for the changed eligible user.
pub fn allowance_proof_of_life_update_is_valid(
  transaction: Transaction,
  validity_range: ValidityRange,
  state_input: state_types.State,
  state_output: state_types.State,
  allowance_updates: List<state_types.AllowanceUpdate>,
) -> Bool {
  // Core invariant for every allowance-use: the non-allowance fields stay
  // equal. Both PoL-unchanged and PoL-renewing branches share this.
  let core_preserved = state_unchanged_except_users_and_pol_unlock_time(
    state_input,
    state_output,
  )
  let proof_of_life_unchanged = state_input.proof_of_life.unlock_time == state_output.proof_of_life.unlock_time

  if proof_of_life_unchanged {
    // Allowance use without proof-of-live renewal: nothing extra to check.
    core_preserved
  } else {
    // Allowance use that ALSO renews proof-of-live: the changed user must be
    // allowed to renew it, must have signed, and the renewal window must be
    // valid.
    and {
      core_preserved,
      allowance_updates_are_signed_by_changed_user(
        transaction,
        allowance_updates,
      ),
      allowance_update_can_renew_proof_of_life(
        allowance_updates,
        state_input.access.users,
      ),
      proof_of_life.has_valid_renewal_window(
        validity_range,
        state_input,
        state_output,
      ),
    }
  }
}

/// True iff the transaction is signed by some user who is BOTH non-admin AND
/// has `can_renew_proof_of_life: True`.
///
/// Admins are intentionally EXCLUDED from this path. Admins can already keep
/// the wallet alive via `RunOperator(Use, Admin)` (which renews proof-of-life
/// as a side effect of any admin operation). The `RenewProofOfLife` redeemer
/// is the lightweight, no-admin-rights path designed for a separate "liveness
/// keeper" key whose only privilege is heartbeat.
///
/// INTENTIONAL LIVENESS TRADE-OFF: a keeper can renew `unlock_time` every
/// window (each renewal bounded by `increment`, but repeatable forever), so in
/// an admin-less wallet whose only recovery path is a beneficiary, an
/// active keeper can defer beneficiary unlock indefinitely. This is by design —
/// the keeper is a trusted liveness role. Losing the keeper key simply lets
/// proof-of-life lapse, after which beneficiaries unlock normally. Only grant
/// `can_renew_proof_of_life` to a key trusted at least as much as the
/// operators. See `lib/state/configuration.ak` module header.
pub fn proof_of_life_user_signature_matches(
  transaction: Transaction,
  users: List<state_types.User>,
) -> Bool {
  list.any(
    users,
    fn(user) {
      let user_signed_tx = list.any(
        user.user_wallets,
        fn(wallet) { list.has(transaction.extra_signatories, wallet) },
      )
      and {
        !user.is_admin,
        user.can_renew_proof_of_life,
        user_signed_tx,
      }
    },
  )
}

// The only user that may renew proof-of-live through allowance use is the changed eligible user.
fn allowance_update_can_renew_proof_of_life(
  allowance_updates: List<state_types.AllowanceUpdate>,
  users: List<state_types.User>,
) -> Bool {
  when allowance_updates is {
    [allowance_update] ->
      list.any(
        users,
        fn(user) {
          and {
            !user.is_admin,
            user.can_renew_proof_of_life,
            user.user_wallets == allowance_update.changed_user_wallets,
          }
        },
      )
    _ -> False
  }
}
