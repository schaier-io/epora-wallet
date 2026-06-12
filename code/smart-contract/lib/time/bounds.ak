//// Validity-range bound helpers.
////
//// Cardano transaction validity is an interval; on-chain logic almost always
//// needs the *finite* slot at one or both ends. These helpers extract those
//// finite bounds as `Option<Int>`, so a caller can pick its own failure style:
////
////   - fail the tx:        `expect Some(t) = finite_upper(vr)`
////   - reject as a `Bool`:  `when finite_range(vr) is { Some((lo, hi)) -> .., None -> False }`
////
//// Centralising the unwrap keeps the boundary semantics (`Finite` vs the open
//// `-inf` / `+inf` ends) in one audited place instead of re-spelled at every
//// call site.
////
//// INCLUSIVITY ASSUMPTION (audited): these helpers read only `bound_type` and
//// deliberately DISCARD the `is_inclusive` flag on each bound. Safe today
//// because (a) the ledger guarantees the tx's real inclusion slot lies within
//// the validity range, so an attacker cannot push `finite_lower` above — or
//// `finite_upper` below — the actual slot; and (b) every consumer compares in
//// the conservative direction: the LOWER bound gates "has enough time passed?"
//// (allowance reset, beneficiary unlock, accrual-so-far floor) and the UPPER
//// bound drives "forward progress / reserve window" (next allowance reset,
//// proof-of-life renewal ceiling, streaming-payment reserve). A one-slot
//// boundary ambiguity therefore never favours the adversary. CAVEAT: a future
//// time check whose safe direction is EXCLUSIVE at the boundary would need to
//// consult `is_inclusive` here — revisit this assumption before adding one.

use aiken/interval.{Finite}
use cardano/transaction.{ValidityRange}
use time/types.{POSIXTime}

/// The earliest slot the tx can be included in (`invalid_before`), if finite.
/// `None` for an open `-inf` lower bound.
pub fn finite_lower(validity_range: ValidityRange) -> Option<POSIXTime> {
  when validity_range.lower_bound.bound_type is {
    Finite(tx_earliest_time) -> Some(tx_earliest_time)
    _ -> None
  }
}

/// The latest slot the tx can be included in (`invalid_hereafter`), if finite.
/// `None` for an open `+inf` upper bound.
pub fn finite_upper(validity_range: ValidityRange) -> Option<POSIXTime> {
  when validity_range.upper_bound.bound_type is {
    Finite(tx_latest_time) -> Some(tx_latest_time)
    _ -> None
  }
}

/// Both finite bounds as `Some((earliest, latest))`, or `None` if either end
/// is open. Use when a rule needs a fully bounded validity window.
pub fn finite_range(
  validity_range: ValidityRange,
) -> Option<(POSIXTime, POSIXTime)> {
  when (finite_lower(validity_range), finite_upper(validity_range)) is {
    (Some(tx_earliest_time), Some(tx_latest_time)) ->
      Some((tx_earliest_time, tx_latest_time))
    _ -> None
  }
}
