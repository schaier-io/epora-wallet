//// User-path STT spend decision bodies: the individually-signed, non-operator
//// actions — `RenewProofOfLife` (a liveness keeper's renewal), `UseAllowance`
//// (one user draws on their per-day allowance), and `UseBeneficiary` (an
//// unlocked beneficiary's one-shot recovery draw). Authority on every path here
//// is a specific user's or beneficiary's own signature, never the operator gate.
////
//// Each `eval_*` here owns the full invariant set for one individually-signed
//// `SttAction` branch; the dispatch and the shared co-firing containment story
//// (whitepaper Formal Model — "The two validators", Bounded-movement theorem)
//// live in `validators/stt.ak::eval_spend`.

use aiken/collection/list
use assets/entries as asset_entries
use constants
use numeric_bounds
use state/allowance as state_allowance
use state/authorization as state_authorization
use state/proof_of_life
use state/types as state_types
use stt/action_checks.{
  allowance_pol_renewal_is_valid, allowance_update_is_signed_by_changed_user,
  proof_of_life_user_signature_matches,
}
use stt/io.{TransitionContext, stt_value_preserved_or_increased}
use stt/preservation.{
  state_unchanged_except_beneficiary_removed,
  state_unchanged_except_pol_unlock_time,
  state_unchanged_except_users_and_pol_unlock_time,
}
use time/bounds

/// Proof-of-life renewal by an opted-in non-admin user; no wallet-side spend.
pub fn eval_renew_proof_of_life(context: TransitionContext) -> Bool {
  expect
    proof_of_life_user_signature_matches(
      context.transaction,
      context.input_state.access.users,
    )
  expect
    state_unchanged_except_pol_unlock_time(
      context.input_state,
      context.output_state,
    )
  // A renewal must actually renew. `expect_valid_renewal_window` passes
  // TRIVIALLY when `unlock_time` is unchanged, so without this a liveness keeper
  // could replay a bit-identical no-op every block to occupy the single STT
  // thread and stall the operators. Nothing legitimate is lost: a renewal that does not move the
  // deadline forward has no effect, and when the deadline already sits beyond
  // `tx_earliest + increment` the window check rejects every value anyway.
  expect
    context.input_state.proof_of_life.unlock_time != context.output_state.proof_of_life.unlock_time
  expect
    proof_of_life.expect_valid_renewal_window(
      context.validity_range,
      context.input_state,
      context.output_state,
    )
  expect stt_value_preserved_or_increased(context)
  True
}

/// Allowance use: exactly one user spends part of their per-day allowance.
/// The redeemer's declared spent-allowance must match the state diff.
pub fn eval_use_allowance(
  declared_spent_allowance: state_types.AssetEntries,
  context: TransitionContext,
) -> Bool {
  expect
    list.length(declared_spent_allowance) <= constants.max_allowance_entries
  expect asset_entries.entries_are_valid(declared_spent_allowance)
  // Both bounds must be finite for an allowance-use action. The lower bound
  // gates whether the per-day allowance is treated as reset; the upper bound
  // drives the new `next_allowance_reset`. See
  // `lib/state/allowance.ak::effective_allowance` for the rationale.
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    context.validity_range,
  )
  expect numeric_bounds.is_non_negative_bounded(tx_earliest_time)
  expect numeric_bounds.is_non_negative_bounded(tx_latest_time)
  expect
    state_unchanged_except_users_and_pol_unlock_time(
      context.input_state,
      context.output_state,
    )
  let allowance_updates = state_allowance.expect_allowance_updates(
    context.input_state.access.users,
    context.output_state.access.users,
    tx_earliest_time,
    tx_latest_time,
  )
  // `expect_allowance_updates` validates each changed user but leaves the
  // diff count unconstrained — this destructure is the load-bearing
  // exactly-one-changed-user enforcement.
  expect [allowance_update] = allowance_updates
  // The acting user is identified implicitly: the single-update destructure
  // above plus `..._signed_by_changed_user` (that user's wallets must sign)
  // uniquely fix the actor without a declared-id field in the redeemer. (An
  // earlier revision carried `changed_user_id` in the redeemer and checked
  // equality here; the field was dropped during refactor — see git history.)
  expect
    allowance_update_is_signed_by_changed_user(
      context.transaction,
      allowance_update,
    )
  // Renewal-only leg: preservation, the single-update shape, and the signature
  // are owned above — the helper adds only can-renew eligibility + window.
  expect
    allowance_pol_renewal_is_valid(
      context.validity_range,
      context.input_state,
      context.output_state,
      allowance_update,
    )
  expect stt_value_preserved_or_increased(context)
  expect declared_spent_allowance == allowance_update.spent_allowance
  True
}

/// Beneficiary use: the single unlocked+signed beneficiary withdraws its
/// weighted share (bounded wallet-side in `lib/wallet/beneficiary_share.ak`) and
/// is REMOVED from the forwarded state. One-shot removal is what makes the
/// weighted-share cap a true ceiling: the beneficiary cannot come back next
/// block for another slice, and the remaining beneficiaries' shares re-normalise
/// against the reduced weight total.
pub fn eval_use_beneficiary(
  declared_beneficiary_id: Int,
  context: TransitionContext,
) -> Bool {
  expect numeric_bounds.is_bounded(declared_beneficiary_id)
  let beneficiary = state_authorization.expect_single_beneficiary_with_unlock_authority(
    context.transaction,
    context.validity_range,
    context.input_state,
  )
  expect declared_beneficiary_id == beneficiary.id
  expect
    state_unchanged_except_beneficiary_removed(
      context.input_state,
      context.output_state,
      beneficiary.id,
    )
  // DELIBERATELY NOT re-checked here: `has_reachable_access_path`. Unlike
  // `RemoveAccessIndex`, this path may remove the last admin, multisig, or
  // beneficiary path. That terminal recovery state is pinned by
  // `security_intentional__use_beneficiary_last_removal_reaches_terminal_state`
  // (audit F-2) and recorded in the whitepaper's "Terminal recovery state"
  // limitation. Adding the check would not make the final draw repeatable: this
  // handler REQUIRES the acting beneficiary to be removed
  // (`state_unchanged_except_beneficiary_removed`), so a reachability guard would
  // block the last draw in an operator-less single-beneficiary wallet. This
  // transition can run without a wallet input.
  // When the wallet validator also runs, it checks only the consumed wallet
  // input. The reference dApp rejects terminal recovery while any stream remains.
  // It permits zero or one credential-wide fund pool and drains that pool in the
  // same transaction when present. Omitted or later fund pools can remain locked.
  // Limited user actions can also remain available.
  expect stt_value_preserved_or_increased(context)
  True
}
