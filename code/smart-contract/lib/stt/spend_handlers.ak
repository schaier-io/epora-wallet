//// Per-action STT spend decision bodies.
////
//// Extracted from `validators/stt.ak` (rule #1: validators stay thin; decision
//// logic lives in `lib/`). The validator owns the action -> handler dispatch in
//// `eval_spend`; each `pub fn eval_*` here owns the full set of invariants for
//// one `SttAction` branch, calling into `lib/state`, `lib/streaming_payments`,
//// and the sibling `lib/stt/{io,preservation,action_checks}` modules. The
//// co-firing containment invariant (whitepaper Formal Model — "The two
//// validators", Bounded-movement theorem) applies per handler: each branch
//// fully contains its own STT-side safety and never relies solely on the wallet
//// validator. Driven end-to-end through `eval_spend` by the `stt_*_tests.ak`
//// siblings.

use aiken/collection/list
use assets/entries as asset_entries
use cardano/address.{Credential}
use constants
use state/allowance as state_allowance
use state/authorization as state_authorization
use state/configuration as state_configuration
use state/proof_of_life
use state/types as state_types
use streaming_payments/forwarding as streaming_payment_forwarding
use streaming_payments/payout as streaming_payment_payout
use streaming_payments/shape as streaming_payment_shape
use stt/action_checks.{
  allowance_proof_of_life_update_is_valid,
  allowance_updates_are_signed_by_changed_user,
  proof_of_life_user_signature_matches,
}
use stt/io.{TransitionContext, stt_value_preserved_or_increased}
use stt/preservation.{
  state_completely_unchanged, state_unchanged_except_access_index_removed,
  state_unchanged_except_beneficiary_removed,
  state_unchanged_except_intended_stake_credential,
  state_unchanged_except_pol_unlock_time,
  state_unchanged_except_pol_unlock_time_and_streaming_payments,
  state_unchanged_except_streaming_payments,
  state_unchanged_except_users_and_pol_unlock_time,
}
use time/bounds

// Operator use: only renews proof-of-live and forwards an operator wallet rule.
// Admin-use is the sole path that may move non-lovelace assets in the STT output.
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

// Operator state update: arbitrary access / proof-of-life reconfiguration
// (subject to configuration validation), no wallet-side spend.
//
// INTENTIONAL — UpdateState does NOT enforce the per-renewal `increment` cap on
// `proof_of_life.unlock_time` (it never calls `has_valid_renewal_window`, unlike
// Use / RenewProofOfLife / ManageStreamingPayments). An operator — an Admin OR a
// Multisig quorum — may therefore set `unlock_time` to any well-formed value here,
// including jumping it far FORWARD or moving it into the PAST in a single tx.
// Moving it to the past (e.g. Some(0)) makes any configured beneficiaries
// immediately unlockable; this is within the operator trust model (an operator
// can already drain via `Use`, so enabling a beneficiary draw is strictly weaker
// than powers they hold — audit A4). This is allowed by design:
//   - UpdateState is the full reconfiguration path and must be able to (re)configure
//     proof-of-life from scratch — e.g. enabling it for the first time (None -> Some),
//     where `has_valid_renewal_window` has no prior `increment` to bound against and
//     would reject the transition outright. The increment cap is meant for the
//     lightweight heartbeat paths, not for reconfiguration.
//   - Operators are trusted at the authorization-gate level: an Admin or a Multisig
//     quorum that can run UpdateState can already drain the wallet via `Use` and
//     rewrite access, so deferring beneficiary unlock is strictly weaker than powers
//     they already hold. Operator (and liveness-keeper) authority outranks beneficiary
//     recovery by design — see the whitepaper's Recovery-reachability theorem.
// Consequence to keep in mind: an operator can push `unlock_time` far out and THEN
// lose its key, deferring beneficiary recovery until that distant time. Such a config
// is "distant-but-finite" (recoverable, not bricked), so it is accepted on-chain and
// surfaced as an OFF-CHAIN warning (`state-validation.ts::collectStateDatumWarnings`),
// never rejected here. See the whitepaper's "Shape, not timing, of recovery"
// limitation.
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

// Streaming-payment management: extend streaming payments and renew proof-of-live; no
// wallet-side spend.
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

// Cheap, operator-authorized removal of ONE access entry (user or beneficiary)
// by list index. Unlike UpdateState it does NOT re-run
// `expect_valid_state_configuration`: removing one entry from an already-valid
// access set cannot introduce a duplicate id, a shared wallet, or an invalid
// allowance, so only the recovery-reachability shape is re-checked (the one
// invariant a removal can break). Linear cost, so it stays affordable even if
// execution-budget parameters tighten; and it bypasses the access-list size caps
// so an over-cap wallet can shrink back under them one entry at a time. No wallet
// spend — the wallet validator only lets `kind == Use` move funds.
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

// Admin/multisig-admin-only: set the wallet's `intended_stake_credential` — the
// stake credential every continuing wallet output must carry (enforced by the
// wallet validator). ONLY that field changes; no wallet spend. Authority is the
// standard operator gate (Admin, or a Multisig quorum) selected by
// `operator_action.path`. This is the sole path that may change it (the central
// preservation check in `eval_spend` forbids every other action from doing so).
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

// Proof-of-live renewal by an opted-in non-admin user; no wallet-side spend.
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

// Allowance use: exactly one user spends part of their per-day allowance.
// The redeemer's declared spent-allowance must match the state diff.
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

// Beneficiary use: the single unlocked+signed beneficiary withdraws its
// weighted share (bounded wallet-side in `lib/wallet/rules.ak`) and is REMOVED
// from the forwarded state. One-shot removal is what makes the weighted-share
// cap a true ceiling: the beneficiary cannot come back next block for another
// slice, and the remaining beneficiaries' shares re-normalise against the
// reduced weight total.
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

// Streaming-payment payout: only streaming payments may change; STT value must be
// strictly preserved (==, stricter than >=); declared payout delta must equal
// the computed streaming-payment delta.
pub fn eval_pay_streaming_payment(
  declared_payout_delta: state_types.AssetEntries,
  context: TransitionContext,
) -> Bool {
  expect context.output_stt_value == context.input_stt_value
  expect
    state_unchanged_except_streaming_payments(
      context.input_state,
      context.output_state,
    )
  // The crank is PERMISSIONLESS (no signature required — value can only ever
  // reach a configured payee). It must therefore make REAL progress: a no-op
  // `PayStreamingPayment` (identical streaming-payment set, empty delta) would
  // still consume and re-create the STT, letting ANY party repeatedly occupy the
  // single STT thread and stall the owner's transactions — including a
  // proof-of-life renewal, which could then lapse the dead-man-switch — at only
  // fee cost. Requiring the streaming-payment set to actually change closes that
  // unauthenticated churn while still allowing every genuine settlement (a
  // paid-out increase, or the zero-residual removal of a matured payment — both
  // alter the list). See audit finding F-1.
  expect
    context.input_state.streaming_payments != context.output_state.streaming_payments

  // Inter-crank cooldown (whitepaper: Settlement-cadence theorem). Even with
  // the real-progress guard above, a
  // PERMISSIONLESS crank can re-occupy the single STT thread every block at fee
  // cost, stalling the owner's transactions — including a proof-of-life renewal,
  // which could then lapse the dead-man-switch. So a permissionless crank must
  // land at least `permissionless_payout_cooldown_ms` after the previous
  // permissionless crank, and advances `last_permissionless_payout_at` to this
  // tx's UPPER bound.
  //
  // The clock tracks ONLY the unauthenticated path. Any AUTHORIZED co-signature —
  // admin or multisig quorum (urgent settlement), or an UNLOCKED beneficiary
  // (recovery: the settle-and-remove-every-stream sequence that precedes the
  // terminal sweep must not be rate-limited once the operators are gone) —
  // bypasses the cooldown AND does NOT advance the clock: each such actor can
  // already occupy the STT thread at will via its own authorized actions (Use /
  // Consolidate), so it is not the threat the cooldown bounds, and re-stamping on
  // its behalf would only push out a legitimate payee's next permissionless crank.
  //
  // The authorized branch MUST still PRESERVE the field explicitly:
  // `PayStreamingPayment` is exempt from the central preservation guard in
  // `eval_spend`, so without this pin an authorized actor — including an unlocked
  // beneficiary, who is inside the threat model — could write an arbitrary
  // (far-future) stamp and freeze every later permissionless crank.
  //
  // Bound choice mirrors the audited convention in `time/bounds`: the LOWER bound
  // gates "has the cooldown elapsed?" (using the upper bound would let an attacker
  // pass instantly with a huge `invalid_hereafter`), and recording the UPPER bound
  // stamps "no earlier than now" (using the lower bound would let an attacker
  // stamp a PAST time and skip the next cooldown). The window is capped at
  // `max_payout_validity_window_ms` (1h) so the upper-bound stamp can sit at most
  // 1h beyond the lower bound — otherwise one crank with a distant
  // `invalid_hereafter` could stamp years ahead and freeze every later
  // permissionless crank. The cap is only meaningful on the permissionless
  // (stamping) branch, so it lives there.
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    context.validity_range,
  )
  let authorized_signer_bypasses_cooldown = or {
    state_authorization.has_operator_authority(
      context.transaction,
      context.input_state,
      state_types.Admin,
    ),
    state_authorization.has_operator_authority(
      context.transaction,
      context.input_state,
      state_types.Multisig,
    ),
    state_authorization.has_unlocked_beneficiary_authority(
      context.transaction,
      context.validity_range,
      context.input_state,
    ),
  }
  let cooldown_and_stamp_ok = if authorized_signer_bypasses_cooldown {
    // Authorized crank: skips the cooldown and leaves the permissionless clock
    // exactly as it was (see the comment above on why this must be pinned).
    context.output_state.last_permissionless_payout_at == context.input_state.last_permissionless_payout_at
  } else {
    // Permissionless crank: the cooldown must have elapsed since the previous
    // permissionless crank, the validity window must fit the cap, and the clock
    // advances to this tx's upper bound.
    let window_within_cap = tx_latest_time - tx_earliest_time <= constants.max_payout_validity_window_ms
    let cooldown_elapsed = when
      context.input_state.last_permissionless_payout_at
    is {
      Some(last_payout_at) ->
        tx_earliest_time >= last_payout_at + constants.permissionless_payout_cooldown_ms
      None -> True
    }
    let stamped_to_tx_upper_bound = context.output_state.last_permissionless_payout_at == Some(
      tx_latest_time,
    )
    and {
      window_within_cap,
      cooldown_elapsed,
      stamped_to_tx_upper_bound,
    }
  }
  expect cooldown_and_stamp_ok

  expect
    streaming_payment_payout.payout_is_valid(
      context.input_reference,
      context.transaction_outputs,
      context.input_state.streaming_payments,
      context.output_state.streaming_payments,
      context.validity_range,
    )
  let payout_delta = streaming_payment_payout.total_value_change(
    context.input_state.streaming_payments,
    context.output_state.streaming_payments,
  )
    |> asset_entries.flatten_to_entries
  expect declared_payout_delta == payout_delta
  True
}

// Payee self-cancel: the PAYEE of ONE streaming payment (identified by its `id`),
// by signing, stops its OWN future accrual. That payment's `end_date` is moved
// down to the tx upper bound ("now") — never up, never below the no-clawback
// floor (`is_payee_cancelled`). It touches only that one payment; every other
// payment is forwarded exactly, and access, proof-of-life, STT value, the stake
// credential, and the cooldown clock are all preserved. No wallet spend, and no
// proof-of-life renewal — the payee is not a liveness keeper, so this path may
// not even touch `pol.unlock_time` (stricter than `ManageStreamingPayments`).
//
// Authority is the payee's OWN signature (the `payout_address` payment key), not
// an operator's: a payee may always switch off income destined for it (purely
// self-affecting — it gives up its OWN future accrual and can claw back nothing),
// but can reshape nothing else. A script-credential payee cannot sign, so it has
// no self-cancel path and must use operator `ManageStreamingPayments`.
//
// ONE-SHOT: real progress (`input.streaming_payments != output`) is required, so a
// payee cannot replay no-op cancels to occupy the single STT thread and stall the
// owner — the same unauthenticated-churn class the permissionless
// `PayStreamingPayment` cooldown guards (audit F-1 / Settlement-cadence theorem).
// Once `end_date` sits at "now" the floor pins output == input for the target, so
// a second cancel produces no change and this guard rejects it — the action
// cannot recur.
pub fn eval_cancel_streaming_payment(
  declared_streaming_payment_id: Int,
  context: TransitionContext,
) -> Bool {
  expect Some(target_streaming_payment) =
    list.find(
      context.input_state.streaming_payments,
      fn(streaming_payment) {
        streaming_payment.id == declared_streaming_payment_id
      },
    )
  expect
    state_authorization.has_streaming_payment_payee_authority(
      context.transaction,
      target_streaming_payment.payout_address,
    )
  // The tx upper bound is both the "now" the cancel caps `end_date` at and the
  // no-clawback floor; a cancel on an unbounded tx has no "now" reference, so a
  // finite upper bound is required.
  expect Some(tx_latest_time) = bounds.finite_upper(context.validity_range)
  expect
    state_unchanged_except_streaming_payments(
      context.input_state,
      context.output_state,
    )
  // One-shot real progress (see the header): rejects a replayed no-op cancel.
  expect
    context.input_state.streaming_payments != context.output_state.streaming_payments
  expect
    streaming_payment_forwarding.is_payee_cancelled(
      context.input_state.streaming_payments,
      context.output_state.streaming_payments,
      declared_streaming_payment_id,
      tx_latest_time,
    )
  expect stt_value_preserved_or_increased(context)
  True
}

// Consolidation: cannot change STT state. Wallet-side validator enforces that
// the consolidation actually preserves wallet value.
pub fn eval_consolidate(
  consolidate_path: state_types.ConsolidatePath,
  context: TransitionContext,
) -> Bool {
  expect state_completely_unchanged(context.input_state, context.output_state)
  expect
    state_authorization.has_consolidate_authority(
      context.transaction,
      context.validity_range,
      context.input_state,
      consolidate_path,
    )
  expect stt_value_preserved_or_increased(context)
  True
}
