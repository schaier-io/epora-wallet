//// State configuration validation: structural rules a new or updated State
//// must satisfy before the STT will accept it.
////
//// SECURITY INVARIANTS (see README §"Role Model & Trust Boundaries"):
//// - The state must always have at least one reachable access path. A SIGNABLE
////   admin (an `is_admin` record carrying at least one wallet key) alone
////   satisfies this — admin-only wallets are permitted, and losing the sole
////   admin key is an accepted user risk, not a configuration error. A
////   wallet-less admin record is NOT a path (it can never sign, structurally —
////   same standard as the multisig arm and the beneficiary wallet rule). A
////   state with NO signable admin is accepted only if a satisfiable multisig
////   path or a signable beneficiary exists, so a wallet can never be bricked
////   by misconfiguration. See the whitepaper's Recovery-reachability theorem.
//// - User wallets and beneficiary wallets may overlap intentionally
////   (`security_intentional__multisig_shared_key_counts_each_role_*`).
//// - Multisig threshold satisfiability is checked only as part of recovery
////   reachability (`has_reachable_access_path`), which SHORT-CIRCUITS when an
////   admin exists. So a `multi_sig_threshold` higher than the total available
////   multisig power is rejected ONLY in an admin-less wallet (where it would
////   otherwise be the sole, unsatisfiable recovery path). With an admin
////   present such a threshold is ACCEPTED but inert: the Multisig path simply
////   never meets it (`multisig_threshold_is_met` returns False), so it grants
////   no authority and the admin still operates. Either way the wallet cannot
////   lock itself out via multisig misconfiguration.
//// - INTENTIONAL — a liveness keeper outranks beneficiary recovery. In an
////   admin-less wallet whose only recovery path is a beneficiary, a
////   `can_renew_proof_of_life` user (the liveness keeper) can keep renewing
////   `unlock_time` and thereby defer beneficiary unlock indefinitely. This is
////   by design: the keeper is a trusted liveness role, and if its key is lost
////   (it stops renewing) proof-of-life lapses and beneficiaries unlock as
////   normal. Treat the keeper as at least as trusted as the operators. See
////   `lib/stt/action_checks.ak::proof_of_life_user_signature_matches`.
//// - INTENTIONAL — recovery reachability is a *shape* check, not a *timing*
////   check. On-chain we reject only a genuine FULL lock: no operator path
////   (admin or satisfiable multisig) AND no beneficiary that can ever unlock
////   (none with a wallet, or `unlock_time` unset while beneficiaries exist).
////   A beneficiary whose `unlock_after` / `unlock_time` sits far in the future
////   is distant-but-finite — i.e. recoverable — so it is ACCEPTED on-chain and
////   surfaced as an OFF-CHAIN warning instead (frontend
////   `state-validation.ts::collectStateDatumWarnings`). The contract never
////   rejects a config that is merely time-locked, only one that is truly
////   bricked.

use aiken/collection/list
use aiken/option
use aiken/primitive/bytearray
use assets/entries as asset_entries
use constants
use state/proof_of_life
use state/types.{AccessControl, Beneficiary, State, User}
use streaming_payments/shape as streaming_payment_shape

/// Validate the full state configuration before the STT accepts it.
///
/// This bundles BOTH structural checks (unique IDs, well-formed settings,
/// non-negative limits) AND security-shape checks (at least one reachable
/// non-admin recovery path, multisig threshold satisfiable, beneficiary
/// wallets distinct from each other). Both kinds of failure produce the same
/// "invalid configuration" rejection — callers don't get to distinguish.
///
/// Returns `True` on success; fails the transaction via `expect` on breach.
pub fn expect_valid_state_configuration(state: State) -> Bool {
  // Cap the optional human label so a giant `wallet_name` cannot bloat the STT
  // datum that every future spend must decode (audit A1; `constants.max_wallet_name_bytes`).
  expect bytearray.length(state.wallet_name) <= constants.max_wallet_name_bytes
  expect streaming_payment_shape.expect_valid(state.streaming_payments)
  expect proof_of_life.expect_valid_settings(state.proof_of_life)
  expect expect_access_control_is_valid(state.access, state)
  True
}

// Access control must have valid users, beneficiaries, wallet separation, and a live recovery path.
fn expect_access_control_is_valid(access: AccessControl, state: State) {
  expect and {
      expect_users_are_valid(access.users),
      expect_beneficiaries_are_valid(access.beneficiaries),
      beneficiaries_require_proof_of_life_settings(
        access.beneficiaries,
        state.proof_of_life.unlock_time,
      )?,
      expect_beneficiary_wallets_are_distinct(access.beneficiaries),
      has_reachable_access_path(access)?,
    }
  True
}

// User ids must remain unique, and every user's allowance bundles must be
// well-formed (non-negative quantities, no duplicate (policy, asset) entries).
// Validating here (not only lazily at use time) fails fast on a misconfigured
// allowance instead of silently producing a user who can never spend.
fn expect_users_are_valid(users: List<User>) {
  // Cap the record count so configuration validation (and every later spend
  // that scans the user list) stays within the per-tx execution budget. See
  // `constants.max_users`; removal stays reachable via `RemoveAccessIndex`.
  expect list.length(users) <= constants.max_users
  let user_ids = list.map(users, fn(user) { user.id })
  expect list.length(list.unique(user_ids)) == list.length(users)
  expect
    list.all(
      users,
      fn(user) {
        and {
          // Cap the per-record inner lists so the worst-case state stays inside
          // the execution budget (audit A1). The allowance caps also bound the
          // per-entry work every later `UseAllowance` / reserve scan performs.
          (list.length(user.user_wallets) <= constants.max_wallets_per_user)?,
          (list.length(user.per_day_allowance) <= constants.max_allowance_entries)?,
          (list.length(user.remaining_allowance) <= constants.max_allowance_entries)?,
          asset_entries.entries_are_valid(user.per_day_allowance)?,
          asset_entries.entries_are_valid(user.remaining_allowance)?,
        }
      },
    )
  True
}

// Beneficiaries must have unique ids and a positive weight (their proportional
// share of the distributable pool — see `lib/wallet/beneficiary_share.ak`).
fn expect_beneficiaries_are_valid(beneficiaries: List<Beneficiary>) {
  // Cap the record count: beneficiary validation is quadratic (pairwise wallet
  // distinctness), so bound it to keep transitions within budget. See
  // `constants.max_beneficiaries`; removal stays reachable via `RemoveAccessIndex`.
  expect list.length(beneficiaries) <= constants.max_beneficiaries
  let beneficiary_ids = list.map(
    beneficiaries,
    fn(beneficiary) { beneficiary.id },
  )

  expect list.length(list.unique(beneficiary_ids)) == list.length(beneficiaries)
  expect list.all(beneficiaries, fn(beneficiary) { beneficiary.weight >= 1 })
  // Every beneficiary must carry at least one signable wallet. Under the
  // weighted-share model a beneficiary's take is capped at
  // `weight / remaining_weight` of the pool and the actor is removed one-shot,
  // so the set only sweeps the WHOLE pool when every member can eventually sign.
  // A wallet-less beneficiary can never withdraw yet still inflates
  // `remaining_weight` (see `lib/wallet/beneficiary_share.ak`), permanently locking its
  // proportional share — and because `beneficiaries_have_reachable_full_withdrawal_path`
  // only needs ONE signable beneficiary, such a config would slip past the
  // reachability gate and silently break the "never bricked by misconfiguration"
  // invariant (whitepaper: Recovery-reachability theorem). Requiring a wallet
  // on every beneficiary keeps the collective-sweep guarantee true. Mirrored
  // off-chain in `state-validation.ts`.
  expect
    list.all(
      beneficiaries,
      fn(beneficiary) {
        and {
          (list.length(beneficiary.beneficiary_wallets) > 0)?,
          // Upper-cap the wallet list so it cannot bloat the datum past the
          // execution budget (audit A1; `constants.max_beneficiary_wallets`).
          (list.length(beneficiary.beneficiary_wallets) <= constants.max_beneficiary_wallets)?,
        }
      },
    )
  True
}

// Beneficiary wallets must be unique and never overlap with another beneficiary.
fn expect_beneficiary_wallets_are_distinct(beneficiaries: List<Beneficiary>) {
  expect
    list.all(
      beneficiaries,
      fn(beneficiary) {
        expect_beneficiary_wallets_are_distinct_from_others(
          beneficiary,
          beneficiaries,
        )
      },
    )
  True
}

/// A beneficiary cannot share wallets with itself or with any other beneficiary.
pub fn expect_beneficiary_wallets_are_distinct_from_others(
  beneficiary: Beneficiary,
  beneficiaries: List<Beneficiary>,
) {
  // The beneficiary's own wallet list must not contain duplicates.
  let own_wallets_unique = list.length(
    list.unique(beneficiary.beneficiary_wallets),
  ) == list.length(beneficiary.beneficiary_wallets)
  expect own_wallets_unique
  // No OTHER beneficiary (different id) may share any wallet with this one.
  expect !beneficiary_shares_wallet_with_another(beneficiary, beneficiaries)
  True
}

// True if any OTHER beneficiary (different id) shares one of this one's wallets.
fn beneficiary_shares_wallet_with_another(
  beneficiary: Beneficiary,
  beneficiaries: List<Beneficiary>,
) -> Bool {
  list.any(
    beneficiaries,
    fn(other_beneficiary) {
      other_beneficiary.id != beneficiary.id && wallets_overlap(
        beneficiary.beneficiary_wallets,
        other_beneficiary.beneficiary_wallets,
      )
    },
  )
}

// True if the two wallet lists share at least one entry.
fn wallets_overlap(
  wallets_a: List<ByteArray>,
  wallets_b: List<ByteArray>,
) -> Bool {
  list.any(wallets_b, fn(wallet) { list.has(wallets_a, wallet) })
}

// Any beneficiary configuration requires proof-of-live settings to exist.
fn beneficiaries_require_proof_of_life_settings(
  beneficiaries: List<Beneficiary>,
  unlock_time: Option<Int>,
) -> Bool {
  list.is_empty(beneficiaries) || option.is_some(unlock_time)
}

/// At least one access path must be reachable. A SIGNABLE admin alone suffices
/// (admin-only wallets are permitted — admin-key loss is an accepted user risk).
/// "Signable" is structural, mirroring the multisig arm (`user_wallets > 0`) and
/// the every-beneficiary-has-a-wallet rule: an `is_admin` record with NO wallets
/// can never satisfy `has_operator_authority`, so counting it as a recovery path
/// would let a state whose ONLY entry is such a record pass validation while
/// being permanently stranded (whitepaper goal G2 — no representable dead-end).
/// A wallet-less admin record alongside another reachable path stays legal; it
/// is merely inert, like a zero-power multisig user. With no signable admin,
/// recovery must remain possible through multisig or a signable beneficiary, so
/// a wallet can never be bricked by misconfiguration.
pub fn has_reachable_access_path(access: AccessControl) -> Bool {
  let has_signable_admin = list.any(
    access.users,
    fn(user) { user.is_admin && list.length(user.user_wallets) > 0 },
  )
  if has_signable_admin {
    True
  } else {
    let has_multisig_or_beneficiary_path = or {
      users_have_reachable_multisig_access_path(
        access.users,
        access.multi_sig_threshold,
      ),
      beneficiaries_have_reachable_full_withdrawal_path(access.beneficiaries),
    }
    has_multisig_or_beneficiary_path
  }
}

/// A multisig threshold is *met* when it is positive and the summed
/// `multi_sig_power` of all users that BOTH carry positive power AND satisfy
/// `user_counts` reaches it. The `user_counts` predicate is the only thing that
/// differs between the two callers of this consensus-critical arithmetic:
///   - authorization (spend-time):  "did this user SIGN?"   — actual authority
///   - configuration (mint/update): "CAN this user sign?"   — reachability
/// Keeping the weighted sum here means the two paths can never silently diverge.
pub fn multisig_threshold_is_met(
  users: List<User>,
  multi_sig_threshold: Option<Int>,
  user_counts: fn(User) -> Bool,
) -> Bool {
  when multi_sig_threshold is {
    Some(required_power) -> {
      let signed_power = list.foldl(
        users,
        0,
        fn(user, total_signed_power) {
          when user.multi_sig_power is {
            // A user's power counts only if it is positive AND the per-caller
            // predicate holds (signed, at spend time / can-sign, at config time).
            Some(power) ->
              if power > 0 && user_counts(user) {
                total_signed_power + power
              } else {
                total_signed_power
              }
            None -> total_signed_power
          }
        },
      )
      // `required_power > 0` rejects a vacuous pass when no power is required.
      let requirement_is_nonzero = required_power > 0
      let signed_power_meets_requirement = signed_power >= required_power
      requirement_is_nonzero? && signed_power_meets_requirement?
    }
    None -> False
  }
}

// Multisig recovery requires enough reachable power from users that actually
// have wallets ("can sign") — see `multisig_threshold_is_met`.
fn users_have_reachable_multisig_access_path(
  users: List<User>,
  multi_sig_threshold: Option<Int>,
) -> Bool {
  multisig_threshold_is_met(
    users,
    multi_sig_threshold,
    fn(user) { list.length(user.user_wallets) > 0 },
  )
}

// Beneficiary recovery is reachable as long as at least one beneficiary exists
// with a wallet that can sign. Under the weighted-share model the beneficiary
// set collectively withdraws the entire distributable pool (each share is
// weight/remaining_weight and weights are retired on use, so the last actor
// sweeps the remainder). That collective-sweep guarantee holds ONLY because
// `expect_beneficiaries_are_valid` requires EVERY beneficiary to carry a
// signable wallet (and `weight >= 1`): with no wallet-less, high-weight
// beneficiary able to lock its share, any present beneficiary is a sufficient
// non-admin recovery path.
//
// TIMING CAVEAT (intentional): "reachable" here is *structural* — it does NOT
// bound WHEN the unlock happens. A signable beneficiary whose effective unlock
// (the max of its own `unlock_after` and the global `unlock_time`) is far in
// the future still counts as reachable, even though the wallet is then
// inaccessible until that time. A distant-but-finite unlock is recoverable, so
// on-chain accepts it and the off-chain layer warns when such a beneficiary is
// the sole recovery path (see module header).
fn beneficiaries_have_reachable_full_withdrawal_path(
  beneficiaries: List<Beneficiary>,
) -> Bool {
  list.any(
    beneficiaries,
    fn(beneficiary) { list.length(beneficiary.beneficiary_wallets) > 0 },
  )
}
