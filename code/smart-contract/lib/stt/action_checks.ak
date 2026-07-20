//// Action-level signature/authority checks for the allowance and proof-of-life
//// paths. Extracted from `validators/stt.ak`; this module owns the "who must
//// have signed" predicates, consumed solely by `lib/stt/user_handlers.ak` (whose
//// `eval_*` bodies are dispatched from `validators/stt.ak::eval_spend`).

use aiken/collection/list
use cardano/transaction.{Transaction, ValidityRange}
use state/authorization as state_authorization
use state/proof_of_life
use state/types as state_types

/// An allowance update can only be signed by the user whose allowance changed.
pub fn allowance_update_is_signed_by_changed_user(
  transaction: Transaction,
  allowance_update: state_types.AllowanceUpdate,
) -> Bool {
  state_authorization.any_wallet_signed(
    transaction.extra_signatories,
    allowance_update.changed_user_wallets,
  )
}

/// Renewal-only leg of an allowance use: trivially `True` when `unlock_time`
/// is unchanged (no renewal attempted); otherwise the changed user must be
/// renewal-eligible and the new `unlock_time` must land in the legal window.
///
/// NOT safe standalone — the caller (`eval_use_allowance`) already owns core
/// preservation (`state_unchanged_except_users_and_pol_unlock_time`), the
/// exactly-one-update shape, and the changed-user signature; this helper
/// re-checks none of them.
pub fn allowance_pol_renewal_is_valid(
  validity_range: ValidityRange,
  state_input: state_types.State,
  state_output: state_types.State,
  allowance_update: state_types.AllowanceUpdate,
) -> Bool {
  if state_input.proof_of_life.unlock_time == state_output.proof_of_life.unlock_time {
    // Allowance use without proof-of-life renewal: nothing extra to check.
    True
  } else {
    // Allowance use that ALSO renews proof-of-life: the changed user must be
    // allowed to renew it and the renewal window must be valid.
    and {
      allowance_update_can_renew_proof_of_life(
        allowance_update,
        state_input.access.users,
      )?,
      proof_of_life.expect_valid_renewal_window(
        validity_range,
        state_input,
        state_output,
      )?,
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
/// keeper" key whose only privilege is renewal.
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
      let user_signed_tx = state_authorization.any_wallet_signed(
        transaction.extra_signatories,
        user.user_wallets,
      )
      is_renewal_eligible(user) && user_signed_tx
    },
  )
}

// THE single definition of "who is a liveness keeper" (CLAUDE.md §3): non-admin
// AND explicitly granted `can_renew_proof_of_life`. Both renewal scans below
// differ only in how they bind the eligible user to the transaction (signature
// vs. changed-allowance wallets).
fn is_renewal_eligible(user: state_types.User) -> Bool {
  !user.is_admin && user.can_renew_proof_of_life
}

// The only user that may renew proof-of-life through allowance use is the changed eligible user.
fn allowance_update_can_renew_proof_of_life(
  allowance_update: state_types.AllowanceUpdate,
  users: List<state_types.User>,
) -> Bool {
  list.any(
    users,
    fn(user) {
      is_renewal_eligible(user) && user.user_wallets == allowance_update.changed_user_wallets
    },
  )
}
