//// Settlement-path STT spend decision bodies: `PayStreamingPayment` (the
//// widest-authority, cadence-limited crank), `CancelStreamingPayment` (a payee
//// stopping its own stream), and `Consolidate` (value-preserving UTxO cleanup).
//// These are the paths whose authority is not a single wallet role: the crank
//// accepts any stakeholder (operator, listed user, stream payee, or unlocked
//// beneficiary), the cancel is signed by the payee (an outsider to the wallet's
//// access list), and consolidation is open to every authorized path.
////
//// Each `eval_*` here owns the full invariant set for one settlement `SttAction`
//// branch; the dispatch and the shared co-firing containment story (whitepaper
//// Formal Model — "The two validators", Bounded-movement theorem) live in
//// `validators/stt.ak::eval_spend`.

use assets/entries as asset_entries
use constants
use state/authorization as state_authorization
use state/types as state_types
use streaming_payments/forwarding as streaming_payment_forwarding
use streaming_payments/payout as streaming_payment_payout
use streaming_payments/shape as streaming_payment_shape
use streaming_payments/types as streaming_payment_type
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
  expect crank_authority_and_cooldown_ok(context)
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

/// Who may crank, and how often (whitepaper: Settlement-cadence theorem).
///
/// THE CRANK IS NOT PERMISSIONLESS. An earlier revision let ANY party settle a
/// stream, on the theory that value can only ever reach a configured payee. That
/// holds for the *value*, but not for the *thread*: the STT is a singleton, so an
/// unauthenticated party could consume and re-create it every block at fee cost
/// and stall the owner's transactions — including a proof-of-life renewal, which
/// could then lapse the dead-man-switch. The old defence was a "real progress"
/// diff (`input.streaming_payments != output.streaming_payments`) plus a cooldown,
/// but the diff never bounded anything: one lovelace of progress satisfies it, so
/// the churn was always available. It has been REMOVED as ineffective; authority
/// plus cadence is what actually bounds the thread.
///
/// The crank must now be signed by a party with a stake in this wallet:
///   - an ADMIN, or a MULTISIG quorum          — the operators;
///   - ANY listed USER                          — `has_any_user_authority`;
///   - ANY stream's PAYEE ("receiver")          — `has_any_streaming_payment_payee_authority`;
///   - an UNLOCKED BENEFICIARY                  — recovery must be able to settle
///     every stream before the terminal sweep, even with the operators gone.
/// The payee arm is what keeps settlement reachable when every wallet key is
/// lost: the party actually owed the money can always pull it.
///
/// CADENCE: only an ADMIN is exempt. Every other cranker — multisig, user, payee
/// and beneficiary alike — must land at least `non_admin_payout_cooldown_ms`
/// after the previous non-admin crank and stamps `last_non_admin_payout_at`
/// with this tx's UPPER bound. Throttling recovery is acceptable because ONE
/// crank settles every stream at once (`payout_is_valid` iterates the whole set),
/// so a beneficiary never needs a burst.
///
/// The admin branch MUST still PRESERVE the field explicitly:
/// `PayStreamingPayment` is exempt from the central preservation guard in
/// `eval_spend`, so without this pin an admin could write an arbitrary
/// (far-future) stamp and freeze every later crank.
///
/// Bound choice mirrors the audited convention in `time/bounds`: the LOWER bound
/// gates "has the cooldown elapsed?" (using the upper bound would let an attacker
/// pass instantly with a huge `invalid_hereafter`), and recording the UPPER bound
/// stamps "no earlier than now" (using the lower bound would let an attacker
/// stamp a PAST time and skip the next cooldown). The window is capped at
/// `max_payout_validity_window_ms` (1h) so the upper-bound stamp can sit at most
/// 1h beyond the lower bound — otherwise one crank with a distant
/// `invalid_hereafter` could stamp years ahead and freeze every later crank. The
/// cap is only meaningful on the stamping branch, so it lives there.
fn crank_authority_and_cooldown_ok(context: TransitionContext) -> Bool {
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    context.validity_range,
  )
  let is_admin_crank = state_authorization.has_operator_authority(
    context.transaction,
    context.input_state,
    state_types.Admin,
  )
  if is_admin_crank {
    // Admin crank: exempt from the cadence limit, and leaves the non-admin clock
    // exactly as it was (see the header on why this must be pinned).
    (context.output_state.last_non_admin_payout_at == context.input_state.last_non_admin_payout_at)?
  } else {
    // Every non-admin cranker must be one of the four authorized parties, must
    // respect the cadence limit, and advances the clock to this tx's upper bound.
    let signed_by_authorized_cranker = or {
      state_authorization.has_operator_authority(
        context.transaction,
        context.input_state,
        state_types.Multisig,
      ),
      state_authorization.has_any_user_authority(
        context.transaction,
        context.input_state,
      ),
      state_authorization.has_any_streaming_payment_payee_authority(
        context.transaction,
        context.input_state.streaming_payments,
      ),
      state_authorization.has_unlocked_beneficiary_authority(
        context.transaction,
        context.validity_range,
        context.input_state,
      ),
    }
    let window_within_cap = tx_latest_time - tx_earliest_time <= constants.max_payout_validity_window_ms
    let cooldown_elapsed = when
      context.input_state.last_non_admin_payout_at
    is {
      Some(last_payout_at) ->
        tx_earliest_time >= last_payout_at + constants.non_admin_payout_cooldown_ms
      None -> True
    }
    let stamped_to_tx_upper_bound = context.output_state.last_non_admin_payout_at == Some(
      tx_latest_time,
    )
    and {
      signed_by_authorized_cranker?,
      window_within_cap?,
      cooldown_elapsed?,
      stamped_to_tx_upper_bound?,
    }
  }
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
/// ONE-SHOT: the target must be unmarked and the accepted transition writes
/// `cancelled_at = Some(tx_latest_time)` while strictly shortening `end_date`.
/// Every other path preserves that marker, so no later validity window — even a
/// deliberately smaller upper bound — can authorize a second cancellation.
pub fn eval_cancel_streaming_payment(
  declared_streaming_payment_id: Int,
  context: TransitionContext,
) -> Bool {
  expect Some(target_streaming_payment) = streaming_payment_type.find_by_id(
    context.input_state.streaming_payments,
    declared_streaming_payment_id,
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
  // Real progress remains explicit for transition diagnosability; the durable
  // one-shot property itself comes from the marker checked by the rule below.
  expect
    context.input_state.streaming_payments != context.output_state.streaming_payments
  expect
    streaming_payment_forwarding.is_payee_cancelled(
      context.input_state.streaming_payments,
      context.output_state.streaming_payments,
      declared_streaming_payment_id,
      tx_latest_time,
    )
  // A cancel must leave a SHAPE-VALID payment set, exactly as the operator stop
  // path (`eval_manage_streaming_payments`) and the config paths (mint /
  // `UpdateState`) do. This was the ONE streaming-payment rewrite that skipped
  // it, which let a payee cap a not-yet-started stream's `end_date` below its
  // `start_date` and commit a negative `lifetime_total` — a set that then blocks
  // `UpdateState` and every wallet-funded settlement for the whole wallet.
  // The payee cap's `start_date` clamp now makes that unreachable; a marked
  // `start_date == end_date` output is the sole valid zero-lifetime exception.
  // This check is the class-level invariant behind it, so no future edit to the
  // forwarding rule can reintroduce an unshaped set through this path.
  expect
    streaming_payment_shape.is_valid(context.output_state.streaming_payments)
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
