//// Beneficiary weighted-share bound: how much of the wallet an unlocked
//// beneficiary may withdraw in one recovery spend.
////
//// One audit concern — "how much can an heir take?". The wallet validator's
//// `UseBeneficiary` branch (`lib/wallet/rules.ak`) calls `paid_out_within_share`
//// as the sole cap on beneficiary outflow; the payout-routing concern ("where
//// may value land?") lives in the sibling `payout_routing.ak`. The property
//// tests below stay co-located because they exercise the PRIVATE
//// `distributable_pool` clamp directly (the sanctioned test co-location noted in
//// the contracts CLAUDE.md — testing it through a `pub` wrapper would hide the
//// clamp the tests are pinning).

use aiken/collection/list
use aiken/fuzz
use assets/entries as asset_entries
use cardano/assets.{quantity_of}
use state/types as state_types

// A beneficiary may take at most its weighted share of the distributable pool,
// computed per asset:
//
//   pool(asset) = max(0, wallet_input(asset) − streaming_reserve(asset))
//   max_take    = floor( weight_self / remaining_weight × pool(asset) )
//
// `remaining_weight` is the sum of weights of all beneficiaries still present
// in the input state (the acting one included), so it is always >= 1 and the
// shares of any subset re-normalise to the whole pool as beneficiaries are
// removed. Subtracting the streaming reserve first keeps a beneficiary from
// drawing the streaming-payment amount ACCRUED-BUT-UNPAID as of the tx upper
// bound (`tx_latest_time`). NOTE: this is a point-in-time guard, not a
// full-schedule one — the reserve only covers accrual up to `tx_latest_time`,
// which the spender chooses (subject to `tx_earliest >= unlock_time`). A
// beneficiary can therefore pick an early upper bound and draw funds that the
// streaming payment's FUTURE accrual will need; a future-dated payment
// (start > tx_latest) is reserved at 0. Protecting the full remaining schedule
// would require reserving `total_remaining_obligation` here instead — a
// deliberate trade-off (it would let long streaming payments starve heirs).
//
// The bound is checked in the division-free form
// `quantity × remaining_weight ≤ weight_self × pool`, which is equivalent to
// `quantity ≤ floor(weight_self × pool / remaining_weight)` for the
// non-negative integers involved.
pub fn paid_out_within_share(
  weight_self: Int,
  remaining_weight: Int,
  input_value: assets.Value,
  streaming_reserve: assets.Value,
  paid_out_value: assets.Value,
) -> Bool {
  asset_entries.every_asset(
    paid_out_value,
    fn(asset) {
      asset_payout_within_weighted_share(
        asset,
        weight_self,
        remaining_weight,
        input_value,
        streaming_reserve,
      )
    },
  )
}

// Per-asset weighted-share bound for one paid-out asset (division-free form; see
// `paid_out_within_share` for the full derivation).
fn asset_payout_within_weighted_share(
  asset: state_types.AssetEntry,
  weight_self: Int,
  remaining_weight: Int,
  input_value: assets.Value,
  streaming_reserve: assets.Value,
) -> Bool {
  // Negative or zero net movement (value returning to the wallet) never
  // exceeds a non-negative share.
  if asset.quantity <= 0 {
    True
  } else {
    // Same `distributable_pool` helper the property tests exercise — keep the
    // production clamp and the tested clamp as one definition so they can't drift.
    let reserved = quantity_of(
      streaming_reserve,
      asset.policy_id,
      asset.asset_name,
    )
    let input_amount = quantity_of(
      input_value,
      asset.policy_id,
      asset.asset_name,
    )
    let pool = distributable_pool(input_amount, reserved)
    asset.quantity * remaining_weight <= weight_self * pool
  }
}

// The pool a beneficiary's weighted share is taken against: the wallet input for
// an asset minus its streaming-payment reserve, clamped at 0 (a reserve larger
// than the balance yields an empty pool, never a negative one). Shared by the
// production check above and the property tests below so both clamp identically.
fn distributable_pool(input_amount: Int, reserve_amount: Int) -> Int {
  let available = input_amount - reserve_amount
  if available > 0 {
    available
  } else {
    0
  }
}

// ===========================================================================
// Property-based coverage for the weighted-share bound, the arithmetic that
// caps each beneficiary's recovery. Single-asset (ada) values are enough to
// exercise the per-asset rule. `remaining_weight` is built as
// `weight_self + other + 1`, so it is always >= 1 and `weight_self` never
// exceeds it — matching the on-chain invariant (the acting beneficiary is one of
// the beneficiaries summed into `remaining_weight`).
// ===========================================================================

// The exact floor boundary: a take equal to floor(weight_self * pool /
// remaining_weight) passes, and one unit more fails. This pins the rounding of
// the division-free check against the integer floor it is meant to equal.
test prop_weighted_share_boundary_is_exact_floor(
  args via fuzz.both(
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
  ),
) {
  let ((input_amount, reserve_amount), (weight_self, other_weight)) = args
  let remaining_weight = weight_self + other_weight + 1
  let input_value = assets.from_lovelace(input_amount)
  let streaming_reserve = assets.from_lovelace(reserve_amount)
  let pool = distributable_pool(input_amount, reserve_amount)
  let max_share = weight_self * pool / remaining_weight
  let passes_at_max = paid_out_within_share(
    weight_self,
    remaining_weight,
    input_value,
    streaming_reserve,
    assets.from_lovelace(max_share),
  )
  let fails_above_max = !paid_out_within_share(
    weight_self,
    remaining_weight,
    input_value,
    streaming_reserve,
    assets.from_lovelace(max_share + 1),
  )
  and {
    passes_at_max,
    fails_above_max,
  }
}

// A single beneficiary can never take more than the whole distributable pool:
// any take that passes the share check is bounded by the pool, since
// `weight_self <= remaining_weight`.
test prop_weighted_share_take_never_exceeds_pool(
  args via fuzz.both(
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
    fuzz.both(
      fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
      fuzz.int_at_least(0),
    ),
  ),
) {
  let ((input_amount, reserve_amount), ((weight_self, other_weight), take)) = args
  let remaining_weight = weight_self + other_weight + 1
  let pool = distributable_pool(input_amount, reserve_amount)
  let passes = paid_out_within_share(
    weight_self,
    remaining_weight,
    assets.from_lovelace(input_amount),
    assets.from_lovelace(reserve_amount),
    assets.from_lovelace(take),
  )
  !passes || take <= pool
}
