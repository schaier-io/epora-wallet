//// User-path STT spend decision bodies: the individually-signed, non-operator
//// actions — `RenewProofOfLife` (a liveness keeper's heartbeat), `UseAllowance`
//// (one user draws on their per-period allowance), and `UseBeneficiary` (an
//// unlocked beneficiary's one-shot recovery draw). Authority on every path here
//// is a specific user's or beneficiary's own signature, never the operator gate.
////
//// One of the three per-authority-family handler modules split out of the
//// former `spend_handlers.ak` (rule #1: validators stay thin; decision logic
//// lives in `lib/`). Siblings: `operator_handlers.ak` (the `RunOperator` kinds)
//// and `settlement_handlers.ak` (streaming-payment settlement + consolidation).
//// The validator owns the action -> handler dispatch in `eval_spend`; each
//// `pub fn eval_*` here owns the full set of invariants for one `SttAction`
//// branch. The co-firing containment invariant (whitepaper Formal Model — "The
//// two validators", Bounded-movement theorem) applies per handler: each branch
//// fully contains its own STT-side safety and never relies solely on the wallet
//// validator. Driven end-to-end through `eval_spend` by the `stt_*_tests.ak`
//// siblings.

use state/allowance as state_allowance
use state/authorization as state_authorization
use state/proof_of_life
use state/types as state_types
use stt/action_checks.{
  allowance_proof_of_life_update_is_valid,
  allowance_updates_are_signed_by_changed_user,
  proof_of_life_user_signature_matches,
}
use stt/io.{TransitionContext, stt_value_preserved_or_increased}
use stt/preservation.{
  state_unchanged_except_beneficiary_removed,
  state_unchanged_except_pol_unlock_time,
  state_unchanged_except_users_and_pol_unlock_time,
}
use time/bounds

/// Proof-of-live renewal by an opted-in non-admin user; no wallet-side spend.
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
  expect
    proof_of_life.has_valid_renewal_window(
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
  // Both bounds must be finite for an allowance-use action. The lower bound
  // gates whether the per-day allowance is treated as reset; the upper bound
  // drives the new `next_allowance_reset`. See
  // `lib/state/allowance.ak::effective_allowance` for the rationale.
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    context.validity_range,
  )
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
  expect
    allowance_proof_of_life_update_is_valid(
      context.transaction,
      context.validity_range,
      context.input_state,
      context.output_state,
      allowance_updates,
    )
  expect [allowance_update] = allowance_updates
  // The acting user is identified implicitly: `expect_allowance_updates`
  // returns exactly one diff (line above) and `..._signed_by_changed_user`
  // requires that user's wallets to sign. Together these uniquely fix the
  // actor without a declared-id field in the redeemer. (An earlier revision
  // carried `changed_user_id` in the redeemer and checked equality here; the
  // field was dropped during refactor — see git history.)
  expect
    allowance_updates_are_signed_by_changed_user(
      context.transaction,
      allowance_updates,
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
  expect stt_value_preserved_or_increased(context)
  True
}
