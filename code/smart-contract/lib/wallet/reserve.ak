//// Wallet reserve policy: select the assets an action must preserve, calculate
//// their streaming-payment reserve, and check that the wallet leaves it funded.
//// Accrual and funding math live in `streaming_payments/funding.ak`.

use aiken/collection/list
use assets/entries as asset_entries
use cardano/assets
use state/types as state_types
use streaming_payments/funding.{StreamingReserve}
use streaming_payments/types.{StreamingPayment}
use wallet/io.{WalletValueSnapshot}

/// Check the action's reserve and pass the reserve and spent assets to `then`.
/// The movement rules reuse both lists for beneficiary share checks.
/// `tx_latest_time` is the transaction's finite upper validity bound.
pub fn expect_reserve_preserved(
  stt_action: state_types.SttAction,
  streaming_payments: List<StreamingPayment>,
  repeatable_beneficiary_recovery: Bool,
  wallet_values: WalletValueSnapshot,
  tx_latest_time: Int,
  then: fn(StreamingReserve, state_types.AssetEntries) -> result,
) -> result {
  let all_streaming_payments_settled = list.all(
    streaming_payments,
    fn(streaming_payment) {
      streaming_payment.paid_out_amount >= funding.lifetime_total(
        streaming_payment,
      )
    },
  )

  // Operator Use and final recovery can carry dense Values. Check the full
  // reserve with sorted cursors instead of building their complete value delta.
  let requires_full_reserve = if all_streaming_payments_settled {
    False
  } else {
    when stt_action is {
      state_types.RunOperator(operator_action) ->
        operator_action.kind == state_types.Use
      state_types.UseBeneficiary(_) -> repeatable_beneficiary_recovery
      _ -> False
    }
  }
  let requires_spent_asset_reserve = if all_streaming_payments_settled {
    False
  } else {
    when stt_action is {
      state_types.UseAllowance(_) -> True
      state_types.UseBeneficiary(_) -> !repeatable_beneficiary_recovery
      state_types.ExitBeneficiary(_) -> True
      _ -> False
    }
  }
  // Beneficiary share checks still need the wallet delta when no reserve remains.
  let requires_wallet_delta = requires_spent_asset_reserve || when
    stt_action
  is {
    state_types.UseBeneficiary(_) -> !repeatable_beneficiary_recovery
    state_types.ExitBeneficiary(_) -> True
    _ -> False
  }
  let spent_wallet_assets = if requires_wallet_delta {
    let delta = when stt_action is {
      state_types.UseAllowance(spent_allowance) -> spent_allowance
      _ ->
        assets.difference(wallet_values.input_value, wallet_values.output_value)
          |> asset_entries.flatten_to_entries
    }
    list.filter(delta, fn(asset) { asset.quantity > 0 })
  } else {
    []
  }
  let streaming_reserve = if requires_full_reserve {
    funding.calculate_streaming_reserve(streaming_payments, tx_latest_time)
  } else if requires_spent_asset_reserve {
    funding.calculate_streaming_reserve_for_assets(
      streaming_payments,
      tx_latest_time,
      spent_wallet_assets,
    )
  } else {
    []
  }

  // Each spent asset must leave output >= min(input, reserve). Other assets do
  // not constrain its movement. Consolidation preserves the complete value.
  // PayStreamingPayment instead pins the exact delta and tagged payee outputs.
  // Applying this reserve floor to settlement would prevent an underfunded
  // wallet from paying its payees. See the whitepaper's "Under-funded settlement".
  expect
    if requires_full_reserve {
      funding.reserve_assets_remain_funded(
        streaming_reserve,
        wallet_values.input_value,
        wallet_values.output_value,
      )
    } else {
      or {
        !requires_spent_asset_reserve,
        funding.remains_funded(
          streaming_reserve,
          wallet_values.input_value,
          spent_wallet_assets,
        ),
      }
    }

  then(streaming_reserve, spent_wallet_assets)
}
