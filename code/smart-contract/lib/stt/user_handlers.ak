//// User-path STT spend decision bodies: the individually-signed, non-operator
//// actions — `RenewProofOfLife` (a liveness keeper's renewal), `UseAllowance`
//// (one user draws on their per-day allowance), and `UseBeneficiary` (an
//// unlocked beneficiary's recovery draw), permanent exit, and stream stopping.
//// Authority on every path here
//// is a specific user's or beneficiary's own signature, never the operator gate.
////
//// Each `eval_*` here owns the full invariant set for one individually-signed
//// `SttAction` branch; the dispatch and the shared co-firing containment story
//// (whitepaper Formal Model — "The two validators", Bounded-movement theorem)
//// live in `validators/stt.ak::eval_spend`.

use aiken/collection/list
use assets/entries as asset_entries
use cardano/assets.{Value}
use cardano/transaction.{Transaction, ValidityRange}
use constants
use numeric_bounds
use state/allowance as state_allowance
use state/authorization as state_authorization
use state/proof_of_life
use state/types as state_types
use streaming_payments/types as streaming_payment_type
use stt/action_checks.{
  allowance_pol_renewal_is_valid, allowance_update_is_signed_by_changed_user,
  proof_of_life_user_signature_matches,
}
use stt/io.{stt_value_preserved_with_lovelace_top_up}
use stt/preservation.{
  state_completely_unchanged, state_unchanged_except_beneficiary_removed,
  state_unchanged_except_pol_unlock_time,
  state_unchanged_except_users_and_pol_unlock_time,
}
use stt/settlement_handlers.{
  expect_streaming_payment_stopped, non_admin_cadence_is_valid,
}
use time/bounds

/// Proof-of-life renewal by an opted-in non-admin user; no wallet-side spend.
pub fn eval_renew_proof_of_life(
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect
    proof_of_life_user_signature_matches(transaction, input_state.access.users)
  expect state_unchanged_except_pol_unlock_time(input_state, output_state)
  // A renewal must actually renew. `expect_valid_renewal_window` passes
  // TRIVIALLY when `unlock_time` is unchanged, so without this a liveness keeper
  // could replay a bit-identical no-op every block to occupy the single STT
  // thread and stall the operators. Nothing legitimate is lost: a renewal that does not move the
  // deadline forward has no effect, and when the deadline already sits beyond
  // `tx_earliest + increment` the window check rejects every value anyway.
  expect
    input_state.proof_of_life.unlock_time != output_state.proof_of_life.unlock_time
  expect
    proof_of_life.expect_valid_renewal_window(
      validity_range,
      input_state,
      output_state,
    )
  expect
    stt_value_preserved_with_lovelace_top_up(
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
    )
  True
}

/// Allowance use: exactly one user spends part of their per-day allowance.
/// The redeemer's declared spent-allowance must match the state diff.
pub fn eval_use_allowance(
  declared_spent_allowance: state_types.AssetEntries,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect
    list.length(declared_spent_allowance) <= constants.max_allowance_entries
  expect asset_entries.entries_are_valid(declared_spent_allowance)
  // Both bounds must be finite for an allowance-use action. The lower bound
  // gates whether the per-day allowance is treated as reset; the upper bound
  // drives the new `next_allowance_reset`. See
  // `lib/state/allowance.ak::effective_allowance` for the rationale.
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    validity_range,
  )
  expect numeric_bounds.is_non_negative_bounded(tx_earliest_time)
  expect numeric_bounds.is_non_negative_bounded(tx_latest_time)
  expect
    state_unchanged_except_users_and_pol_unlock_time(input_state, output_state)
  let allowance_updates = state_allowance.expect_allowance_updates(
    input_state.access.users,
    output_state.access.users,
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
    allowance_update_is_signed_by_changed_user(transaction, allowance_update)
  // Renewal-only leg: preservation, the single-update shape, and the signature
  // are owned above — the helper adds only can-renew eligibility + window.
  expect
    allowance_pol_renewal_is_valid(
      validity_range,
      input_state,
      output_state,
      allowance_update,
    )
  expect
    stt_value_preserved_with_lovelace_top_up(
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
    )
  expect declared_spent_allowance == allowance_update.spent_allowance
  True
}

/// Beneficiary use: the single unlocked+signed beneficiary withdraws its
/// weighted share (bounded wallet-side in `lib/wallet/beneficiary_share.ak`) and
/// an earlier beneficiary is removed, which makes its weighted share one-shot.
/// The remaining weights then re-normalise. The final beneficiary already owns
/// 100% of the remaining beneficiary weight, so it stays in State and may drain
/// one or more fragmented wallet UTxOs per ledger-valid transaction.
pub fn eval_use_beneficiary(
  declared_beneficiary_id: Int,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  let beneficiary = expect_declared_beneficiary(
    declared_beneficiary_id,
    transaction: transaction,
    validity_range: validity_range,
    input_state: input_state,
  )
  let is_final_beneficiary = list.length(input_state.access.beneficiaries) == 1
  expect
    if is_final_beneficiary {
      state_completely_unchanged(input_state, output_state)
    } else {
      state_unchanged_except_beneficiary_removed(
        input_state,
        output_state,
        beneficiary.id,
      )
    }
  expect
    beneficiary_cadence_and_value_are_valid(
      validity_range: validity_range,
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
      input_state: input_state,
      output_state: output_state,
    )
  // The final beneficiary remains available after each withdrawal. This is the
  // only on-chain way to keep recovery retryable because a transaction cannot
  // prove that no other UTxO exists under the wallet payment credential.
  True
}

/// Permanent exit uses the same unlock authority as beneficiary use, but always
/// removes the actor. Final exit may leave no access path. This deliberate
/// terminal State cannot recover remaining or future deposits without another
/// operator path (see the whitepaper's recovery limitations). Mint and
/// UpdateState still enforce configuration reachability.
pub fn eval_exit_beneficiary(
  declared_beneficiary_id: Int,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  let beneficiary = expect_declared_beneficiary(
    declared_beneficiary_id,
    transaction: transaction,
    validity_range: validity_range,
    input_state: input_state,
  )
  expect
    state_unchanged_except_beneficiary_removed(
      input_state,
      output_state,
      beneficiary.id,
    )
  expect
    list.length(input_state.access.beneficiaries) != 1 || list.is_empty(
      input_state.streaming_payments,
    )
  expect
    beneficiary_cadence_and_value_are_valid(
      validity_range: validity_range,
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
      input_state: input_state,
      output_state: output_state,
    )
  True
}

/// Stop future accrual without changing the debt already recorded by the stream.
/// Beneficiary authority is independent of the payee's address credential type.
/// The shared stop checks preserve the stream and enforce non-admin cadence.
pub fn eval_stop_beneficiary_stream(
  declared_beneficiary_id: Int,
  declared_streaming_payment_id: Int,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect numeric_bounds.is_non_negative_bounded(declared_streaming_payment_id)
  expect _beneficiary = expect_declared_beneficiary(
    declared_beneficiary_id,
    transaction: transaction,
    validity_range: validity_range,
    input_state: input_state,
  )
  expect Some(target_streaming_payment) = streaming_payment_type.find_by_id(
    input_state.streaming_payments,
    declared_streaming_payment_id,
  )
  expect_streaming_payment_stopped(
    target_streaming_payment,
    True,
    validity_range: validity_range,
    input_stt_value: input_stt_value,
    output_stt_value: output_stt_value,
    input_state: input_state,
    output_state: output_state,
  )
}

/// Preserve recovery rights while the wallet pays all beneficiaries exactly.
/// Without a wallet input this authorizes only an unchanged State, or the sole
/// beneficiary's cadence update. Actual distribution is enforced wallet-side.
pub fn eval_distribute_beneficiaries(
  declared_beneficiary_id: Int,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect list.is_empty(input_state.streaming_payments)
  let beneficiaries = input_state.access.beneficiaries
  expect
    list.foldl(
      beneficiaries,
      False,
      fn(beneficiary, initiator_signed) {
        expect
          proof_of_life.is_unlock_time_reached(
            validity_range,
            proof_of_life.calculate_beneficiary_unlock_time(
              beneficiary.unlock_after,
              input_state,
            ),
          )
        initiator_signed || beneficiary.id == declared_beneficiary_id && state_authorization.any_wallet_signed(
          transaction.extra_signatories,
          beneficiary.beneficiary_wallets,
        )
      },
    )
  expect state_completely_unchanged(input_state, output_state)
  expect
    beneficiary_cadence_and_value_are_valid(
      validity_range: validity_range,
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
      input_state: input_state,
      output_state: output_state,
    )
  True
}

// Earlier beneficiaries preserve cadence; the sole beneficiary advances it.
fn beneficiary_cadence_and_value_are_valid(
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect
    stt_value_preserved_with_lovelace_top_up(
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
    )
  if list.length(input_state.access.beneficiaries) == 1 {
    non_admin_cadence_is_valid(
      validity_range: validity_range,
      input_state: input_state,
      output_state: output_state,
    )
  } else {
    output_state.last_non_admin_payout_at == input_state.last_non_admin_payout_at
  }
}

// Existing one-actor paths retain their singleton signer and bounded-id rules.
fn expect_declared_beneficiary(
  declared_beneficiary_id: Int,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_state: state_types.State,
) -> state_types.Beneficiary {
  expect numeric_bounds.is_non_negative_bounded(declared_beneficiary_id)
  let beneficiary = state_authorization.expect_single_beneficiary_with_unlock_authority(
    transaction,
    validity_range,
    input_state,
  )
  expect declared_beneficiary_id == beneficiary.id
  beneficiary
}
