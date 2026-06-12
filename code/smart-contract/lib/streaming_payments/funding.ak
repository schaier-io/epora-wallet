use aiken/collection/list
use aiken/math
use assets/entries as asset_entries
use cardano/assets.{Value, quantity_of}
use constants
use state/types as state_types
use streaming_payments/types.{StreamingPayment}

// Time is in milliseconds and the payout is rounded down to whole asset units.
pub fn calculate_payout_amount_for_elapsed_time(
  time: Int,
  amount_per_day: Int,
) -> Int {
  time * amount_per_day / constants.milliseconds_per_day
}

/// Total payout ACCRUED for `payment` as of `at_time`, capped at its `end_date`
/// so a matured payment stops accruing. This is the single definition of the
/// "accrued-so-far" amount; every site that needs it (the reserve calculation,
/// the retained-payout ceiling, the removal settlement) calls this so the
/// `math.min(end_date, …)` cap can never be forgotten at one of them.
pub fn accrued_at(payment: StreamingPayment, at_time: Int) -> Int {
  calculate_payout_amount_for_elapsed_time(
    math.min(at_time, payment.end_date) - payment.start_date,
    payment.amount_per_day,
  )
}

/// The payment's FULL lifetime payout (`start_date` → `end_date`). Single
/// definition of the total obligation, used by mint validation, the
/// retained-entry "still owes" guard, and removal value accounting.
pub fn lifetime_total(payment: StreamingPayment) -> Int {
  calculate_payout_amount_for_elapsed_time(
    payment.end_date - payment.start_date,
    payment.amount_per_day,
  )
}

/// A spend may not move any asset OUT below the amount still owed to that
/// asset's streaming-payment payees. The rule is PER ASSET and applies only to
/// assets actually spent:
///
///   output(asset) >= min(input(asset), reserve(asset))
///
/// where `reserve(asset)` is the accrued-but-unwithdrawn total for that asset
/// (with a `+1` rounding buffer per still-running payment — see
/// `calculate_minimum_output_value`). Equivalently: an asset left unchanged or
/// increased (`output >= input`) is never constrained; an asset that is spent
/// (`output < input`) must leave at least its reserve behind.
///
/// Consequences:
///   - Moving only lovelace out while a streaming payment is denominated in a
///     different asset is always allowed — the other asset is unchanged, so it
///     imposes no constraint.
///   - You cannot move a reserved asset below what its payee is owed.
///   - A streaming payment in an asset the wallet does NOT hold (`input = 0`)
///     never blocks anything: `min(0, reserve) = 0`, so `output >= 0` is
///     trivially met — it cannot brick unrelated funds. (Its payee is simply
///     unfunded until the wallet holds that asset.)
///
/// **Where**: fires in the wallet validator's `eval_spend`, on every spend.
/// Value-preserving Consolidation passes trivially (`output == input` for every
/// asset). Actions that don't spend the wallet (`ManageStreamingPayments`,
/// `UpdateState`) never reach here.
pub fn expect_remain_funded(
  state: state_types.State,
  self_input_assets: Value,
  self_output_assets: Value,
  tx_latest_time: Int,
) {
  let minimum_output_value = calculate_minimum_output_value(
    state.streaming_payments,
    tx_latest_time,
  )

  expect
    asset_entries.every_asset(
      minimum_output_value,
      fn(asset) {
        let quantity_in_input = quantity_of(
          self_input_assets,
          asset.policy_id,
          asset.asset_name,
        )
        let quantity_in_output = quantity_of(
          self_output_assets,
          asset.policy_id,
          asset.asset_name,
        )
        // `asset.quantity` is this asset's reserved minimum. Only an asset that
        // is actually spent (output < input) must remain funded; an unchanged or
        // increased asset (and any asset the wallet does not hold) imposes no
        // constraint.
        quantity_in_output >= math.min(quantity_in_input, asset.quantity)
      },
    )
  True
}

// Calculate the minimum wallet value that keeps every streaming-payment payout
// safely funded, measured at `tx_latest_time` (accrued-but-unpaid as of the tx
// upper bound). Exposed so the wallet validator can subtract this reserve from
// the pool a beneficiary may draw against. NOTE: this is point-in-time, not a
// full-schedule reserve — it only protects accrual up to `tx_latest_time`, so a
// beneficiary choosing an early upper bound can still draw funds the payment's
// FUTURE accrual will need (see `beneficiary_paid_out_within_weighted_share`).
pub fn calculate_minimum_output_value(
  streaming_payments: List<StreamingPayment>,
  tx_latest_time: Int,
) {
  streaming_payments
    |> list.foldl(
        assets.zero,
        fn(streaming_payment, acc) {
          // Total payout accrued by `tx_latest_time`, capped at end_date so a
          // mature streaming_payment doesn't keep growing the required reserve.
          let accrued_payout = accrued_at(streaming_payment, tx_latest_time)
          // Keep one extra unit to avoid rounding underfunding as time advances.
          let max_remaining_payout = math.max(
            0,
            accrued_payout + 1 - streaming_payment.paid_out_amount,
          )
          assets.merge(
            acc,
            assets.from_asset(
              streaming_payment.policy_id,
              streaming_payment.asset_name,
              max_remaining_payout,
            ),
          )
        },
      )
}
