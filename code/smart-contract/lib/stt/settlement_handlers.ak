//// Settlement-path STT spend decision bodies: `PayStreamingPayment` (the
//// widest-authority, cadence-limited crank), `CancelStreamingPayment` (a payee
//// stopping its own stream), and `Consolidate` (value-preserving UTxO
//// repartition and stake repair).
//// These are the paths whose authority is not a single wallet role. Before
//// final recovery opens, the crank accepts an admin, listed user, stream payee,
//// or unlocked beneficiary. The cancel is signed by the payee, who can be an
//// outsider to the wallet's access list. Once final recovery opens, the cancel
//// must use the exact no-clawback cutoff. This lets each payment move the shared
//// clock at most once. Consolidation is open to every authorized path.
////
//// Each `eval_*` here owns the full invariant set for one settlement `SttAction`
//// branch; the dispatch and the shared co-firing containment story (whitepaper
//// Formal Model — "The two validators", Bounded-movement theorem) live in
//// `validators/stt.ak::eval_spend`.

use aiken/math
use assets/entries as asset_entries
use cardano/assets.{Value}
use cardano/transaction.{OutputReference, Transaction, ValidityRange}
use constants
use numeric_bounds
use state/authorization as state_authorization
use state/types as state_types
use streaming_payments/forwarding as streaming_payment_forwarding
use streaming_payments/payout as streaming_payment_payout
use streaming_payments/shape as streaming_payment_shape
use streaming_payments/types as streaming_payment_type
use stt/io.{stt_value_preserved_with_lovelace_top_up}
use stt/preservation.{
  state_completely_unchanged, state_unchanged_except_streaming_payments,
}
use time/bounds

/// Streaming-payment payout: only streaming payments may change. Native assets
/// at the STT UTxO must stay equal, while ADA may increase for the larger
/// continuing output. The declared payout delta must equal computed progress.
pub fn eval_pay_streaming_payment(
  declared_payout_delta: state_types.AssetEntries,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_reference: OutputReference,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect asset_entries.entries_are_valid(declared_payout_delta)
  expect
    stt_value_preserved_with_lovelace_top_up(
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
    )
  expect state_unchanged_except_streaming_payments(input_state, output_state)
  expect
    crank_authority_and_cooldown_ok(
      transaction: transaction,
      validity_range: validity_range,
      input_state: input_state,
      output_state: output_state,
    )
  expect Some(payout_value_change) = streaming_payment_payout.validated_value_change(
    input_reference,
    transaction.outputs,
    input_state.streaming_payments,
    output_state.streaming_payments,
    validity_range,
  )
  let payout_delta = payout_value_change
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
///   - ANY listed USER, including admins and multisig members
///     (`has_any_user_authority`);
///   - ANY stream's PAYEE ("receiver")          — `has_any_streaming_payment_payee_authority`;
///   - an UNLOCKED BENEFICIARY: this permits settlement before final removal,
///     subject to available funds and cadence limits.
/// The payee arm keeps settlement authorized when every wallet key is lost. It
/// does not guarantee payment when funds or transaction capacity are insufficient.
/// Once the sole beneficiary unlocks, only it may use the non-admin crank branch.
/// This prevents another stakeholder from repeatedly moving the recovery clock.
///
/// CADENCE: only an ADMIN is exempt. Every other cranker, including a multisig
/// signer, user, payee, or beneficiary, must land at least `non_admin_payout_cooldown_ms`
/// after the previous non-admin crank and stamps `last_non_admin_payout_at`
/// with this tx's UPPER bound. A caller may batch any schedules that fit the
/// ledger limits. A non-admin beneficiary must observe the cooldown between
/// transactions. An admin payout bypasses the cooldown.
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
/// 1h beyond the lower bound. Otherwise, one crank with a distant
/// `invalid_hereafter` could stamp years ahead and freeze every later crank. The
/// cap is only meaningful on the stamping branch, so it lives there.
fn crank_authority_and_cooldown_ok(
  transaction: Transaction,
  validity_range: ValidityRange,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    validity_range,
  )
  expect numeric_bounds.is_non_negative_bounded(tx_earliest_time)
  expect numeric_bounds.is_non_negative_bounded(tx_latest_time)
  let is_admin_crank = state_authorization.has_operator_authority(
    transaction,
    input_state,
    state_types.Admin,
  )
  if is_admin_crank {
    // Admin crank: exempt from the cadence limit, and leaves the non-admin clock
    // exactly as it was (see the header on why this must be pinned).
    (output_state.last_non_admin_payout_at == input_state.last_non_admin_payout_at)?
  } else {
    // Every non-admin cranker must be one of the three authorized parties, must
    // respect the cadence limit, and advances the clock to this tx's upper bound.
    // Once the sole beneficiary unlocks, only that beneficiary may advance the
    // clock. Otherwise a listed user or payee could keep postponing terminal
    // recovery with cadence-valid STT-only payout transactions.
    // A separate multisig scan would add no authority before final recovery:
    // every successful quorum contains a listed user signature, and any listed
    // user may already crank then.
    let beneficiary_signed = state_authorization.has_unlocked_beneficiary_authority(
      transaction,
      validity_range,
      input_state,
    )
    let final_recovery_active = state_authorization.final_beneficiary_recovery_is_active(
      validity_range,
      input_state,
    )
    let signed_by_authorized_cranker = if final_recovery_active {
      beneficiary_signed
    } else {
      or {
        state_authorization.has_any_user_authority(transaction, input_state),
        state_authorization.has_any_streaming_payment_payee_authority(
          transaction,
          input_state.streaming_payments,
        ),
        beneficiary_signed,
      }
    }
    and {
      signed_by_authorized_cranker?,
      non_admin_cadence_ok(
        input_state: input_state,
        output_state: output_state,
        tx_earliest_time: tx_earliest_time,
        tx_latest_time: tx_latest_time,
      )?,
    }
  }
}

/// Shared global cadence for non-admin payout cranks, receiver cancellations,
/// beneficiary stream stops, and final-beneficiary recovery.
/// The lower bound proves enough time elapsed; the upper bound becomes the next
/// stamp. Capping their difference prevents a transaction from stamping far into
/// the future after satisfying the gate with an old lower bound.
fn non_admin_cadence_ok(
  input_state: state_types.State,
  output_state: state_types.State,
  tx_earliest_time: Int,
  tx_latest_time: Int,
) -> Bool {
  expect numeric_bounds.is_non_negative_bounded(tx_earliest_time)
  expect numeric_bounds.is_non_negative_bounded(tx_latest_time)
  let window_within_cap = tx_latest_time - tx_earliest_time <= constants.max_payout_validity_window_ms
  let cooldown_elapsed = when input_state.last_non_admin_payout_at is {
    Some(last_payout_at) ->
      tx_earliest_time >= last_payout_at + constants.non_admin_payout_cooldown_ms
    None -> True
  }
  let stamped_to_tx_upper_bound = output_state.last_non_admin_payout_at == Some(
    tx_latest_time,
  )
  and {
    window_within_cap?,
    cooldown_elapsed?,
    stamped_to_tx_upper_bound?,
  }
}

/// Apply the shared non-admin cadence to final-beneficiary recovery, which does
/// not otherwise need finite transaction bounds.
pub fn non_admin_cadence_is_valid(
  validity_range: ValidityRange,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    validity_range,
  )
  non_admin_cadence_ok(
    input_state: input_state,
    output_state: output_state,
    tx_earliest_time: tx_earliest_time,
    tx_latest_time: tx_latest_time,
  )
}

/// Payee self-cancel: the PAYEE of ONE streaming payment (identified by its
/// `id`), by signing, stops its OWN future accrual. That payment's `end_date` is
/// moved down, but never below the tx upper bound ("now") or `start_date`.
/// It touches only that one payment;
/// every other payment is forwarded exactly, and access, proof-of-life, STT
/// value and the stake credential are preserved. The shared non-admin streaming
/// cooldown clock, also used by final-beneficiary recovery, advances to this
/// transaction's upper bound. No
/// wallet spend, and no proof-of-life renewal — the payee is not a liveness
/// keeper, so this path may not even touch `pol.unlock_time` (stricter than
/// `ManageStreamingPayments`).
///
/// Authority is the payee's OWN signature (the `payout_address` payment key), not
/// an operator's: a payee may switch off income destined for it, gives up only
/// its OWN future accrual, and can claw back nothing. The value change is
/// self-affecting, but the action consumes the wallet-wide non-admin streaming
/// cadence slot and can therefore delay another non-admin payout or cancel. It
/// can reshape nothing else. A script-credential payee cannot sign, so it has no
/// self-cancel path and must use operator `ManageStreamingPayments`.
///
/// A strict shortening is required every time. Before final recovery, another
/// shortening is permitted after the shared 30-minute cooldown. Once final
/// recovery opens, the payee must shorten exactly to
/// `max(start_date, tx_latest_time)`. That payment cannot shorten again because
/// every later validity upper bound is past its new end. Without an intervening
/// operator reschedule, payees can therefore take at most 15 terminal cancel
/// actions. One pre-terminal action may straddle the unlock boundary. The
/// one-hour validity cap plus 30-minute cooldown therefore bounds payee-only
/// delay from that boundary to 16 such intervals, or 24 hours.
/// There is no per-payment terminal marker, so an operator may later shorten or
/// extend the schedule through management.
pub fn eval_cancel_streaming_payment(
  declared_streaming_payment_id: Int,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect numeric_bounds.is_non_negative_bounded(declared_streaming_payment_id)
  expect Some(target_streaming_payment) = streaming_payment_type.find_by_id(
    input_state.streaming_payments,
    declared_streaming_payment_id,
  )
  expect
    state_authorization.has_streaming_payment_payee_authority(
      transaction,
      target_streaming_payment.payout_address,
    )
  let final_recovery_active = state_authorization.final_beneficiary_recovery_is_active(
    validity_range,
    input_state,
  )
  expect_streaming_payment_stopped(
    target_streaming_payment,
    final_recovery_active,
    validity_range: validity_range,
    input_stt_value: input_stt_value,
    output_stt_value: output_stt_value,
    input_state: input_state,
    output_state: output_state,
  )
}

/// Shared stop checks for payee cancellation and beneficiary stopping. The caller
/// must authenticate its authority and find the target in the input State.
/// Exact cutoff is mandatory for beneficiary stops and terminal payee cancels.
pub fn expect_streaming_payment_stopped(
  target_streaming_payment: streaming_payment_type.StreamingPayment,
  require_exact_cutoff: Bool,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  let declared_streaming_payment_id = target_streaming_payment.id
  expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
    validity_range,
  )
  expect state_unchanged_except_streaming_payments(input_state, output_state)
  expect
    non_admin_cadence_ok(
      input_state: input_state,
      output_state: output_state,
      tx_earliest_time: tx_earliest_time,
      tx_latest_time: tx_latest_time,
    )
  expect
    streaming_payment_forwarding.is_payee_cancelled(
      input_state.streaming_payments,
      output_state.streaming_payments,
      declared_streaming_payment_id,
      tx_latest_time,
    )
  // A terminal cancel uses the earliest safe end. The next cadence-valid
  // interval starts after this end, so strict shortening makes a second cancel
  // of the same payment impossible. Payee authority remains sufficient.
  expect
    if require_exact_cutoff {
      expect Some(output_target_streaming_payment) = streaming_payment_type.find_by_id(
        output_state.streaming_payments,
        declared_streaming_payment_id,
      )
      output_target_streaming_payment.end_date == math.max(
        target_streaming_payment.start_date,
        tx_latest_time,
      )
    } else {
      True
    }
  // A cancel must leave a SHAPE-VALID payment set, exactly as the operator stop
  // path (`eval_manage_streaming_payments`) and the config paths (mint /
  // `UpdateState`) do. This was the ONE streaming-payment rewrite that skipped
  // it, which let a payee cap a not-yet-started stream's `end_date` below its
  // `start_date` and commit a negative `lifetime_total` — a set that then blocks
  // `UpdateState` and every wallet-funded settlement for the whole wallet.
  // The receiver rule's `start_date` lower bound makes inversion
  // unreachable. This check is the class-level invariant behind it, so no future edit to the
  // forwarding rule can reintroduce an unshaped set through this path.
  expect streaming_payment_shape.is_valid(output_state.streaming_payments)
  expect
    stt_value_preserved_with_lovelace_top_up(
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
    )
  True
}

/// Consolidation: cannot change STT state. Wallet-side validator enforces that
/// the consolidation actually preserves wallet value.
pub fn eval_consolidate(
  consolidate_path: state_types.ConsolidatePath,
  transaction: Transaction,
  validity_range: ValidityRange,
  input_stt_value: Value,
  output_stt_value: Value,
  input_state: state_types.State,
  output_state: state_types.State,
) -> Bool {
  expect state_completely_unchanged(input_state, output_state)
  expect
    state_authorization.has_consolidate_authority(
      transaction,
      validity_range,
      input_state,
      consolidate_path,
    )
  expect
    stt_value_preserved_with_lovelace_top_up(
      input_stt_value: input_stt_value,
      output_stt_value: output_stt_value,
    )
  True
}
