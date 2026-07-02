//// Operator-path STT spend decision bodies: the five `RunOperator` kinds
//// (`Use`, `UpdateState`, `ManageStreamingPayments`, `RemoveAccessIndex`,
//// `SetIntendedStakeCredential`), all gated by the operator authority selected
//// via `operator_action.path` (Admin, or a Multisig quorum).
////
//// One of the three per-authority-family handler modules split out of the
//// former `spend_handlers.ak` (rule #1: validators stay thin; decision logic
//// lives in `lib/`). Siblings: `user_handlers.ak` (individually-signed user /
//// beneficiary paths) and `settlement_handlers.ak` (streaming-payment
//// settlement + consolidation). The validator owns the action -> handler
//// dispatch in `eval_spend`; each `pub fn eval_*` here owns the full set of
//// invariants for one `SttAction` branch. The co-firing containment invariant
//// (whitepaper Formal Model — "The two validators", Bounded-movement theorem)
//// applies per handler: each branch fully contains its own STT-side safety and
//// never relies solely on the wallet validator. Driven end-to-end through
//// `eval_spend` by the `stt_*_tests.ak` siblings.

use cardano/address.{Credential}
use state/authorization as state_authorization
use state/configuration as state_configuration
use state/proof_of_life
use state/types as state_types
use streaming_payments/forwarding as streaming_payment_forwarding
use streaming_payments/shape as streaming_payment_shape
use stt/io.{TransitionContext, stt_value_preserved_or_increased}
use stt/preservation.{
  state_unchanged_except_access_index_removed,
  state_unchanged_except_intended_stake_credential,
  state_unchanged_except_pol_unlock_time,
  state_unchanged_except_pol_unlock_time_and_streaming_payments,
}
use time/bounds

/// Operator use: only renews proof-of-live and forwards an operator wallet rule.
/// Admin-use is the sole path that may move non-lovelace assets in the STT output.
pub fn eval_operator_use(
  operator_action: state_types.OperatorAction,
  context: TransitionContext,
) -> Bool {
  expect
    state_authorization.has_operator_authority(
      context.transaction,
      context.input_state,
      operator_action.path,
    )
  expect
    state_unchanged_except_pol_unlock_time(
      context.input_state,
      context.output_state,
    )
  // Operator-use MAY renew the proof-of-live window but does NOT require it:
  // `has_valid_renewal_window` passes trivially when `unlock_time` is left
  // unchanged, and a state with no proof-of-life configured (unlock_time /
  // increment = None) is still operable via Use. Keeping the wallet on-chain
  // "alive" — so a beneficiary cannot unlock an actively-operated wallet — is
  // therefore the off-chain builder's responsibility: it should renew
  // proof-of-life on operator actions. See README §"Role Model & Trust
  // Boundaries". When proof-of-life IS renewed here, the renewal must land
  // inside the configured increment window (enforced by the call below).
  expect
    proof_of_life.has_valid_renewal_window(
      context.validity_range,
      context.input_state,
      context.output_state,
    )
  // Admin operator-use carve-out: bypass the STT value-preservation check so
  // admin can reshape the STT output's non-lovelace assets. The corresponding
  // streaming_payment-funding invariant is enforced by the wallet validator ONLY
  // on a tx that also spends a wallet UTxO (the wallet validator does not run
  // otherwise). A pure STT-only admin Use therefore has no reserve check here —
  // acceptable because the streaming-payment funds live at the WALLET address,
  // not in this STT UTxO, so reshaping STT-output assets cannot underfund a
  // payee; any later wallet spend re-checks the reserve. Admin is trusted with
  // the STT UTxO's own (min-ADA-tier) contents under the authorization-gate model.
  let is_admin_use = operator_action.path == state_types.Admin
  expect or {
      is_admin_use,
      stt_value_preserved_or_increased(context),
    }
  True
}

/// Operator state update: arbitrary access / proof-of-life reconfiguration
/// (subject to configuration validation), no wallet-side spend.
///
/// INTENTIONAL — UpdateState does NOT enforce the per-renewal `increment` cap on
/// `proof_of_life.unlock_time` (it never calls `has_valid_renewal_window`, unlike
/// Use / RenewProofOfLife / ManageStreamingPayments). An operator — an Admin OR a
/// Multisig quorum — may therefore set `unlock_time` to any well-formed value here,
/// including jumping it far FORWARD or moving it into the PAST in a single tx.
/// Moving it to the past (e.g. Some(0)) makes any configured beneficiaries
/// immediately unlockable; this is within the operator trust model (an operator
/// can already drain via `Use`, so enabling a beneficiary draw is strictly weaker
/// than powers they hold — audit A4). This is allowed by design:
///   - UpdateState is the full reconfiguration path and must be able to (re)configure
///     proof-of-life from scratch — e.g. enabling it for the first time (None -> Some),
///     where `has_valid_renewal_window` has no prior `increment` to bound against and
///     would reject the transition outright. The increment cap is meant for the
///     lightweight heartbeat paths, not for reconfiguration.
///   - Operators are trusted at the authorization-gate level: an Admin or a Multisig
///     quorum that can run UpdateState can already drain the wallet via `Use` and
///     rewrite access, so deferring beneficiary unlock is strictly weaker than powers
///     they already hold. Operator (and liveness-keeper) authority outranks beneficiary
///     recovery by design — see the whitepaper's Recovery-reachability theorem.
///
/// Consequence to keep in mind: an operator can push `unlock_time` far out and THEN
/// lose its key, deferring beneficiary recovery until that distant time. Such a config
/// is "distant-but-finite" (recoverable, not bricked), so it is accepted on-chain and
/// surfaced as an OFF-CHAIN warning (`state-validation.ts::collectStateDatumWarnings`),
/// never rejected here. See the whitepaper's "Shape, not timing, of recovery"
/// limitation.
pub fn eval_operator_state_update(
  operator_action: state_types.OperatorAction,
  context: TransitionContext,
) -> Bool {
  expect
    state_configuration.expect_valid_state_configuration(context.output_state)
  expect
    streaming_payment_forwarding.are_forwarded(
      context.input_state.streaming_payments,
      context.output_state.streaming_payments,
    )
  expect
    state_authorization.has_operator_authority(
      context.transaction,
      context.input_state,
      operator_action.path,
    )
  // Non-admin operators cannot rename the wallet.
  let is_admin_operator = operator_action.path == state_types.Admin
  let wallet_name_unchanged = context.input_state.wallet_name == context.output_state.wallet_name
  expect or {
      is_admin_operator,
      wallet_name_unchanged,
    }
  expect stt_value_preserved_or_increased(context)
  True
}

/// Streaming-payment management: extend streaming payments and renew
/// proof-of-live; no wallet-side spend.
pub fn eval_manage_streaming_payments(
  operator_action: state_types.OperatorAction,
  context: TransitionContext,
) -> Bool {
  expect
    streaming_payment_shape.expect_valid(
      context.output_state.streaming_payments,
    )
  expect
    state_unchanged_except_pol_unlock_time_and_streaming_payments(
      context.input_state,
      context.output_state,
    )
  // The tx's `invalid_hereafter` (upper validity bound) is the no-clawback
  // floor for stopping a streaming payment's future accrual: `end_date` may be
  // moved down to it but never below. `None` when unbounded, which restricts
  // existing payments to forwarding/extending only. An operator may also ADD new
  // streaming payments here (born unsettled); the `expect_valid` above bounds the
  // grown set (count cap, id-uniqueness, shape) and the per-asset reserve is
  // recomputed from the live State on every spend, so adds stay covered.
  let tx_latest_time = bounds.finite_upper(context.validity_range)
  expect
    streaming_payment_forwarding.are_forwarded_rescheduled_or_added(
      context.input_state.streaming_payments,
      context.output_state.streaming_payments,
      tx_latest_time,
    )
  expect
    proof_of_life.has_valid_renewal_window(
      context.validity_range,
      context.input_state,
      context.output_state,
    )
  expect
    state_authorization.has_operator_authority(
      context.transaction,
      context.input_state,
      operator_action.path,
    )
  expect stt_value_preserved_or_increased(context)
  True
}

/// Cheap, operator-authorized removal of ONE access entry (user or beneficiary)
/// by list index. Unlike UpdateState it does NOT re-run
/// `expect_valid_state_configuration`: removing one entry from an already-valid
/// access set cannot introduce a duplicate id, a shared wallet, or an invalid
/// allowance, so only the recovery-reachability shape is re-checked (the one
/// invariant a removal can break). Linear cost, so it stays affordable even if
/// execution-budget parameters tighten; and it bypasses the access-list size caps
/// so an over-cap wallet can shrink back under them one entry at a time. No wallet
/// spend — the wallet validator only lets `kind == Use` move funds.
pub fn eval_remove_access_index(
  target: state_types.AccessIndexTarget,
  operator_action: state_types.OperatorAction,
  context: TransitionContext,
) -> Bool {
  expect
    state_authorization.has_operator_authority(
      context.transaction,
      context.input_state,
      operator_action.path,
    )
  expect
    state_unchanged_except_access_index_removed(
      context.input_state,
      context.output_state,
      target,
    )
  // A removal can only break ONE configuration invariant — leaving no reachable
  // access path — so re-check just this (linear) instead of re-running the full,
  // super-linear `expect_valid_state_configuration`.
  expect
    state_configuration.has_reachable_access_path(context.output_state.access)
  expect stt_value_preserved_or_increased(context)
  True
}

/// Admin/multisig-admin-only: set the wallet's `intended_stake_credential` — the
/// stake credential every continuing wallet output must carry (enforced by the
/// wallet validator). ONLY that field changes; no wallet spend. Authority is the
/// standard operator gate (Admin, or a Multisig quorum) selected by
/// `operator_action.path`. This is the sole path that may change it (the central
/// preservation check in `eval_spend` forbids every other action from doing so).
pub fn eval_set_intended_stake_credential(
  target: Option<Credential>,
  operator_action: state_types.OperatorAction,
  context: TransitionContext,
) -> Bool {
  expect
    state_authorization.has_operator_authority(
      context.transaction,
      context.input_state,
      operator_action.path,
    )
  expect
    state_unchanged_except_intended_stake_credential(
      context.input_state,
      context.output_state,
    )
  expect context.output_state.intended_stake_credential == target
  expect stt_value_preserved_or_increased(context)
  True
}
