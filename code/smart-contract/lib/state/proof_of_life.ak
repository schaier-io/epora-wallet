//// Proof-of-live time logic: when the wallet considers itself "alive" and
//// the windows in which renewal or beneficiary unlock are permitted.
////
//// Beneficiary unlock is split between two modules:
////   - Time-window math lives here (`calculate_beneficiary_unlock_time`,
////     `is_unlock_time_reached`).
////   - Signature / authority check lives in `lib/state/authorization.ak`
////     (`expect_single_beneficiary_with_unlock_authority`).
//// When changing one, audit the other.

use aiken/math
use cardano/transaction.{ValidityRange}
use state/types.{ProofOfLifeSettings, State}
use time/bounds
use time/types as time_types

/// Proof-of-live settings must define unlock time and increment together.
///
/// INTENTIONALLY NOT CHECKED (timing, not shape): `unlock_time` is validated
/// only as a well-formed value (`>= 0`, increment present and `>= 1`). It is NOT
/// required to be in the FUTURE relative to any transaction. A wallet may thus be
/// minted or updated with an `unlock_time` already in the past (e.g. `Some(0)`)
/// while holding beneficiaries — making those beneficiaries immediately
/// unlockable. This matches the deliberate "shape, not timing" scope of the
/// recovery model (see the whitepaper's Recovery-reachability theorem and its
/// "Shape, not timing, of recovery" limitation): the
/// contract rejects only genuinely bricked configs, never merely time-locked or
/// time-lapsed ones. Guarding against an already-lapsed unlock_time is an
/// OFF-CHAIN warning responsibility (`state-validation.ts`), because the
/// validator has no canonical "now" at config-validation time.
pub fn expect_valid_settings(settings: ProofOfLifeSettings) {
  // Paired presence AND well-formed values in one match. `increment == 0` is
  // rejected: a renewal advances `unlock_time` by at most `increment`, so a 0
  // increment could never push the deadline forward before it lapses — the
  // dead-man-switch could never be kept alive. The wildcard arm rejects a
  // mismatched pair (exactly one of the two set) — the paired-presence invariant
  // beneficiaries rely on.
  expect
    when (settings.unlock_time, settings.increment) is {
      // Not configured: both None.
      (None, None) -> True
      // Configured: unlock_time well-formed, increment can advance the deadline.
      (Some(unlock_time), Some(increment)) -> unlock_time >= 0 && increment >= 1
      // Exactly one set — invalid.
      _ -> False
    }
  True
}

/// Beneficiaries unlock at the later of their own delay and the global
/// proof-of-life unlock time. `None` when proof-of-life is unconfigured (no
/// global `unlock_time`): there is then no beneficiary unlock time at all, which
/// `is_unlock_time_reached` treats as "never reached".
pub fn calculate_beneficiary_unlock_time(
  unlock_after: Option<time_types.POSIXTime>,
  state: State,
) -> Option<time_types.POSIXTime> {
  when state.proof_of_life.unlock_time is {
    Some(proof_of_life_unlock_time) ->
      Some(
        beneficiary_unlock_time_after_proof_of_life(
          unlock_after,
          proof_of_life_unlock_time,
        ),
      )
    None -> None
  }
}

/// True once the transaction's earliest time has reached (or passed) the
/// supplied unlock time. A `None` unlock time (proof-of-life unconfigured, so no
/// unlock time exists) is never reached.
///
/// Boundary semantics: `<=` is intentional — at the exact slot `tx_earliest
/// == unlock_time`, the beneficiary may unlock.
pub fn is_unlock_time_reached(
  validity_range: ValidityRange,
  unlock_time: Option<time_types.POSIXTime>,
) -> Bool {
  when (bounds.finite_lower(validity_range), unlock_time) is {
    (Some(tx_earliest_time), Some(unlock)) -> unlock <= tx_earliest_time
    _ -> False
  }
}

/// Proof-of-live renewal may only extend the unlock window inside the configured
/// increment.
///
/// The two bounds of the tx validity range frame the legal range for the new
/// `unlock_time`:
///   - lower bound: `unlock_time <= tx_earliest_time + increment` — caps how
///     far forward the renewal may push, even if the tx has a wide validity
///     window.
///   - upper bound: `unlock_time >= tx_latest_time` — the new unlock must land
///     strictly after the current tx's window, so the same tx can't be reused
///     to "skip" forward.
///
/// If the input and output unlock_time are equal, no renewal happened and the
/// check trivially passes.
pub fn has_valid_renewal_window(
  validity_range: ValidityRange,
  input_state: State,
  output_state: State,
) -> Bool {
  if input_state.proof_of_life.unlock_time == output_state.proof_of_life.unlock_time {
    True
  } else {
    // The validity range must be fully finite — renewal cannot be authorized
    // by a tx with an open-ended `from -∞` or `until +∞` window.
    expect Some((tx_earliest_time, tx_latest_time)) = bounds.finite_range(
      validity_range,
    )
    // PoL must be configured (increment + new unlock_time both present).
    expect Some(increment) = input_state.proof_of_life.increment
    expect Some(updated_unlock_time) = output_state.proof_of_life.unlock_time

    let updated_unlock_at_or_after_tx_latest = updated_unlock_time >= tx_latest_time
    let updated_unlock_within_increment = updated_unlock_time <= tx_earliest_time + increment
    let unlock_time_not_decreased = unlock_time_does_not_decrease(
      input_state.proof_of_life.unlock_time,
      updated_unlock_time,
    )
    and {
      updated_unlock_at_or_after_tx_latest?,
      updated_unlock_within_increment?,
      unlock_time_not_decreased?,
    }
  }
}

// Beneficiaries inherit whichever unlock time is later.
fn beneficiary_unlock_time_after_proof_of_life(
  unlock_after: Option<time_types.POSIXTime>,
  proof_of_life_unlock_time: time_types.POSIXTime,
) -> time_types.POSIXTime {
  when unlock_after is {
    Some(additional_unlock_time) ->
      math.max(additional_unlock_time, proof_of_life_unlock_time)
    None -> proof_of_life_unlock_time
  }
}

// Renewal may extend the unlock time, but never shorten it.
fn unlock_time_does_not_decrease(
  current_unlock_time: Option<Int>,
  next_unlock_time: Int,
) -> Bool {
  when current_unlock_time is {
    Some(previous_unlock_time) -> next_unlock_time >= previous_unlock_time
    None -> True
  }
}
