//// Settlement-path STT spend decision bodies: `PayStreamingPayment` (the
//// permissionless, cooldown-limited crank), `CancelStreamingPayment` (a payee
//// stopping its own stream), and `Consolidate` (value-preserving UTxO cleanup).
//// These are the paths where authority is NOT a wallet role: the crank needs no
//// signature at all, the cancel is signed by the payee (an outsider to the
//// wallet's access list), and consolidation is open to every authorized path.
////
//// One of the three per-authority-family handler modules split out of the
//// former `spend_handlers.ak` (rule #1: validators stay thin; decision logic
//// lives in `lib/`). Siblings: `operator_handlers.ak` (the `RunOperator` kinds)
//// and `user_handlers.ak` (individually-signed user / beneficiary paths). The
//// validator owns the action -> handler dispatch in `eval_spend`; each
//// `pub fn eval_*` here owns the full set of invariants for one `SttAction`
//// branch. The co-firing containment invariant (whitepaper Formal Model — "The
//// two validators", Bounded-movement theorem) applies per handler: each branch
//// fully contains its own STT-side safety and never relies solely on the wallet
//// validator. Driven end-to-end through `eval_spend` by the `stt_*_tests.ak`
//// siblings.

use aiken/collection/list
use assets/entries as asset_entries
use constants
use state/authorization as state_authorization
use state/types as state_types
use streaming_payments/forwarding as streaming_payment_forwarding
use streaming_payments/payout as streaming_payment_payout
use stt/io.{TransitionContext, stt_value_preserved_or_increased}
use stt/preservation.{
  state_completely_unchanged, state_unchanged_except_streaming_payments,
}
use time/bounds

/// Streaming-payment payout: only streaming payments may change; STT value must
/// be strictly preserved (==, stricter than >=); declared payout delta must
/// equal the computed streaming-payment delta.
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
      window_within_cap?,
      cooldown_elapsed?,
      stamped_to_tx_upper_bound?,
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

/// Payee self-cancel: the PAYEE of ONE streaming payment (identified by its
/// `id`), by signing, stops its OWN future accrual. That payment's `end_date` is
/// moved down to the tx upper bound ("now") — never up, never below the
/// no-clawback floor (`is_payee_cancelled`). It touches only that one payment;
/// every other payment is forwarded exactly, and access, proof-of-life, STT
/// value, the stake credential, and the cooldown clock are all preserved. No
/// wallet spend, and no proof-of-life renewal — the payee is not a liveness
/// keeper, so this path may not even touch `pol.unlock_time` (stricter than
/// `ManageStreamingPayments`).
///
/// Authority is the payee's OWN signature (the `payout_address` payment key), not
/// an operator's: a payee may always switch off income destined for it (purely
/// self-affecting — it gives up its OWN future accrual and can claw back nothing),
/// but can reshape nothing else. A script-credential payee cannot sign, so it has
/// no self-cancel path and must use operator `ManageStreamingPayments`.
///
/// ONE-SHOT: real progress (`input.streaming_payments != output`) is required, so
/// a payee cannot replay no-op cancels to occupy the single STT thread and stall
/// the owner — the same unauthenticated-churn class the permissionless
/// `PayStreamingPayment` cooldown guards (audit F-1 / Settlement-cadence
/// theorem). Once `end_date` sits at "now" the floor pins output == input for the
/// target, so a second cancel produces no change and this guard rejects it — the
/// action cannot recur.
pub fn eval_cancel_streaming_payment(
  declared_streaming_payment_id: Int,
  context: TransitionContext,
) -> Bool {
  expect Some(target_streaming_payment) = list.find(
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

/// Consolidation: cannot change STT state. Wallet-side validator enforces that
/// the consolidation actually preserves wallet value.
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
