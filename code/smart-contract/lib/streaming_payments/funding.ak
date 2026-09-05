//// Streaming-payment accrual math and the per-asset funding reserve: how much
//// a stream has earned by a point in time (`accrued_at` / `lifetime_total`) and
//// how much wallet value every spend must leave behind for the payees
//// (`remains_funded`, enforced by the wallet validator on every spend but the crank).

use aiken/collection/list
use aiken/math
use assets/entries as asset_entries
use cardano/assets.{Value, quantity_of}
use constants
use state/types as state_types
use streaming_payments/types.{StreamingPayment}

/// One normalized reserve entry per asset.
///
/// A flat list avoids rebuilding a nested multi-policy `Value`. Equal stream
/// assets are combined once during reserve construction, so later wallet rules
/// do not rescan the same schedule set for every duplicate key.
pub type StreamingReserve =
  state_types.AssetEntries

/// Time is in milliseconds and the payout is rounded down to whole asset units.
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
/// `calculate_streaming_reserve`). Equivalently: an asset left unchanged or
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
///   - UNDER-FUNDED (`0 < input <= reserve`): `min` collapses to `input`, so the
///     rule becomes `output >= input` and NO outflow of that asset is possible.
///     That is the intended answer for a discretionary spend — the wallet holds
///     less than it owes, so nobody may take any of it. It is the WRONG answer
///     for the settlement itself, which is why `PayStreamingPayment` is exempt
///     from this gate in `validators/wallet.ak`: without that exemption the only
///     action that can REDUCE the reserve was blocked by the reserve, `accrued_at`
///     kept growing, and the asset was frozen for payee, operator and beneficiary
///     alike, with no on-chain way back. See the whitepaper's "Under-funded
///     settlement" limitation.
///
/// **Where**: fires in the wallet validator's `eval_spend`, on every spend EXCEPT
/// the crank. Value-preserving Consolidation passes trivially (`output == input`
/// for every asset). Actions that don't spend the wallet
/// (`ManageStreamingPayments`, `UpdateState`) never reach here.
///
/// Takes the normalized reserve, the wallet input, and the positive entries in
/// its already-computed output delta. Settled cleanup skips this function.
pub fn remains_funded(
  streaming_reserve: StreamingReserve,
  self_input_assets: Value,
  spent_assets: state_types.AssetEntries,
) -> Bool {
  list.all(
    spent_assets,
    fn(asset) {
      if asset.quantity <= 0 {
        True
      } else {
        let reserve = reserved_quantity(
          streaming_reserve,
          asset.policy_id,
          asset.asset_name,
        )
        if reserve <= 0 {
          True
        } else {
          let quantity_in_input = quantity_of(
            self_input_assets,
            asset.policy_id,
            asset.asset_name,
          )
          let quantity_in_output = quantity_in_input - asset.quantity
          (quantity_in_output >= math.min(quantity_in_input, reserve))?
        }
      }
    },
  )
}

/// Sum all per-stream reserve contributions for one asset.
pub fn reserved_quantity(
  streaming_reserve: StreamingReserve,
  policy_id: ByteArray,
  asset_name: ByteArray,
) -> Int {
  list.foldl(
    streaming_reserve,
    0,
    fn(entry, total) {
      if entry.policy_id == policy_id && entry.asset_name == asset_name {
        total + entry.quantity
      } else {
        total
      }
    },
  )
}

fn add_reserve_entry(
  streaming_reserve: StreamingReserve,
  entry: state_types.AssetEntry,
) -> StreamingReserve {
  when streaming_reserve is {
    [] -> [entry]
    [head, ..tail] ->
      if head.policy_id == entry.policy_id && head.asset_name == entry.asset_name {
        [
          state_types.AssetEntry {
            ..head,
            quantity: head.quantity + entry.quantity,
          },
          ..tail
        ]
      } else {
        [head, ..add_reserve_entry(tail, entry)]
      }
  }
}

/// Calculate the minimum wallet value that keeps every streaming-payment payout
/// safely funded, measured at `tx_latest_time` (accrued-but-unpaid as of the tx
/// upper bound). Exposed so the wallet validator can subtract this reserve from
/// the pool a beneficiary may draw against. NOTE: this is point-in-time, not a
/// full-schedule reserve — it only protects accrual up to `tx_latest_time`, so a
/// beneficiary choosing an early upper bound can still draw funds the payment's
/// FUTURE accrual will need (see `wallet/beneficiary_share.paid_out_within_share`).
pub fn calculate_streaming_reserve(
  streaming_payments: List<StreamingPayment>,
  tx_latest_time: Int,
) -> StreamingReserve {
  list.foldl(
    streaming_payments,
    [],
    fn(streaming_payment, streaming_reserve) {
      // Total payout accrued by `tx_latest_time`, capped at end_date so a
      // mature streaming_payment does not keep growing the required reserve.
      let accrued_payout = accrued_at(streaming_payment, tx_latest_time)
      // Keep one extra unit to avoid rounding underfunding while a payment
      // still owes value. Once paid_out covers the full lifetime total,
      // including a receiver-created zero-duration schedule, no future accrual
      // exists, so retaining the buffer would lock one settled unit.
      let max_remaining_payout = if streaming_payment.paid_out_amount >= lifetime_total(
        streaming_payment,
      ) {
        0
      } else {
        math.max(0, accrued_payout + 1 - streaming_payment.paid_out_amount)
      }
      if max_remaining_payout > 0 {
        add_reserve_entry(
          streaming_reserve,
          asset_entries.asset_entry(
            streaming_payment.policy_id,
            streaming_payment.asset_name,
            max_remaining_payout,
          ),
        )
      } else {
        streaming_reserve
      }
    },
  )
}

/// Calculate reserve entries only for assets that this action can move out.
/// The caller must first prove that no other asset can decrease.
pub fn calculate_streaming_reserve_for_assets(
  streaming_payments: List<StreamingPayment>,
  tx_latest_time: Int,
  relevant_assets: state_types.AssetEntries,
) -> StreamingReserve {
  streaming_payments
    |> list.filter(
        fn(streaming_payment) {
          list.any(
            relevant_assets,
            fn(asset) {
              asset.policy_id == streaming_payment.policy_id && asset.asset_name == streaming_payment.asset_name
            },
          )
        },
      )
    |> calculate_streaming_reserve(tx_latest_time)
}
