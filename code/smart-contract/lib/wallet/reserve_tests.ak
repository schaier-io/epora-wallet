//// Reserve-policy integration tests run the wallet spend implementation.
//// They cover held and absent reserve assets, Consolidation, and the different
//// treatment of settlement and discretionary spending when funds are low.

use aiken/interval
use cardano/assets
use state/types as state_types
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/wallet_test_helpers as helpers

test wallet_spend_rejects_underfunded_streaming_payments() fail {
  let output_state = states.base_state()
    |> states.with_streaming_payments(
        [states.ada_streaming_payment(1, "beneficiary1", 0)],
      )
  let transaction = helpers.wallet_spend_tx(
    interval.between(86_400_000, 86_400_000),
    output_state,
    fixtures.operator_use_action(state_types.Admin),
    fixtures.wallet_output(assets.from_lovelace(500_000)),
    [],
  )

  expect helpers.run_wallet_spend(transaction)
}

// ---------------------------------------------------------------------------
// Per-asset streaming reserve (output >= min(input, reserve)) — distributed from
// the deadlock probe. Admin RunOperator(Use) over a wallet that holds (or not)
// a streaming payment's asset.
// ---------------------------------------------------------------------------

// A foreign-asset streaming payment (wallet holds 0 of it) does not block an
// unrelated lovelace withdrawal: cc unchanged at 0, min(0, reserve) = 0.
test wallet_spend_foreign_asset_reserve_does_not_block_lovelace() {
  expect
    helpers.run_wallet_spend(
      helpers.admin_use_reserve_tx(
        helpers.reserve_state_with_sp(#"cc", #"01"),
        assets.from_lovelace(5_000_000),
        assets.from_lovelace(4_000_000),
      ),
    )
}

// Draining a HELD reserved asset below its reserve is rejected (holds 5 cc,
// reserve 1, drains to 0).
test wallet_spend_rejects_draining_reserved_asset_below_reserve() fail {
  let in_cc = assets.merge(
    assets.from_lovelace(5_000_000),
    assets.from_asset(#"cc", #"01", 5),
  )
  expect
    helpers.run_wallet_spend(
      helpers.admin_use_reserve_tx(
        helpers.reserve_state_with_sp(#"cc", #"01"),
        in_cc,
        assets.from_lovelace(5_000_000),
      ),
    )
}

// Spending a held reserved asset while keeping >= reserve is allowed (holds
// 5 cc, reserve 1, keeps 2).
test wallet_spend_allows_spending_reserved_asset_above_reserve() {
  let in_cc = assets.merge(
    assets.from_lovelace(5_000_000),
    assets.from_asset(#"cc", #"01", 5),
  )
  let out_keep_2 = assets.merge(
    assets.from_lovelace(5_000_000),
    assets.from_asset(#"cc", #"01", 2),
  )
  expect
    helpers.run_wallet_spend(
      helpers.admin_use_reserve_tx(
        helpers.reserve_state_with_sp(#"cc", #"01"),
        in_cc,
        out_keep_2,
      ),
    )
}

// Value-preserving consolidation passes the reserve trivially, even with a
// foreign-asset streaming payment the wallet does not hold.
test wallet_consolidation_passes_reserve_with_foreign_asset_sp() {
  let input_state = helpers.reserve_state_with_sp(#"cc", #"01")
  let stt_in = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    input_state,
    fixtures.default_stt_value(),
  )
  let stt_out = fixtures.stt_output(
    fixtures.default_policy_id(),
    input_state,
    fixtures.default_stt_value(),
  )
  let wallet_in = fixtures.wallet_input(
    fixtures.wallet_input_ref(),
    assets.from_lovelace(5_000_000),
  )
  let wallet_return = fixtures.wallet_output(assets.from_lovelace(5_000_000))
  let tx = fixtures.transaction_with_stt_redeemer(
    interval.between(50, 100),
    ["admin"],
    [stt_in, wallet_in],
    [stt_out, wallet_return],
    fixtures.tx_id(#"e230"),
    fixtures.stt_input_ref(),
    fixtures.consolidation_action(state_types.AdminPath),
  )
  expect helpers.run_wallet_spend(tx)
}

// Security review 2026-07 (High): the per-asset streaming reserve used to
// deadlock the settlement it exists to protect. For an UNDER-FUNDED wallet
// (`0 < input <= reserve`) the gate `output >= min(input, reserve)` collapses to
// `output >= input`, forbidding EVERY outflow — including the crank, the only
// action that can shrink the reserve — so the asset froze permanently while
// `accrued_at` kept growing. `PayStreamingPayment` is now EXEMPT (its outflow is
// already pinned to the tagged payee outputs), so an under-funded wallet can
// still pay out what it holds.
//
// The canonical stream has accrued 1_000_000 by the tx bounds with nothing paid,
// so the reserve is 1_000_001 — MORE than the 500_000 the wallet holds. The crank
// settles the whole 500_000 to the payee, leaving the wallet at 0. Under the old
// gate `min(500_000, 500_001) = 500_000` demanded `output >= 500_000`, so this
// exact transaction — and every smaller one — was rejected outright.
test streaming_payment_payout_accepts_settlement_from_under_funded_wallet() {
  let transaction = helpers.under_funded_streaming_payment_payout_tx(
    500_000,
    [
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(500_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    500_000,
    fixtures.tx_id(#"5d30"),
  )

  expect helpers.run_wallet_spend(transaction)
}

// The exemption is scoped to the crank ONLY. The same under-funded wallet may not
// be drained by a discretionary spend: an operator `Use` moving value out of a
// wallet holding less than the reserve is still rejected by `remains_funded`,
// which is the whole point of the gate.
test operator_use_rejects_spend_from_under_funded_wallet() fail {
  let input_state = states.streaming_payment_payout_state(0)
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(86_400_000, 86_400_000),
    ["admin"],
    [
      helpers.stt_input_with_state(input_state),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(500_000),
      ),
    ],
    [
      helpers.stt_output_with_state(input_state),
      fixtures.payout_output(
        fixtures.address_from_key("admin"),
        assets.from_lovelace(500_000),
      ),
    ],
    fixtures.tx_id(#"5e30"),
    fixtures.stt_input_ref(),
    fixtures.operator_use_action(state_types.Admin),
  )

  expect helpers.run_wallet_spend(transaction)
}
