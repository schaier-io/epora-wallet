//// Wallet validator spend tests: forwarded operator-use rules, validity-range
//// guards, the per-asset streaming reserve (output >= min(input, reserve)),
//// and streaming-payment payout enforcement. All of these drive
//// `wallet.eval_spend` end to end, so `run_reserve_spend` — the one helper that
//// calls the validator — lives here rather than in the shared lib module.

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use test_support/security_fixtures as fixtures
use test_support/wallet_test_helpers as helpers
use wallet

fn run_reserve_spend(tx: Transaction) -> Bool {
  wallet.eval_spend(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    None,
    0,
    fixtures.wallet_input_ref(),
    tx,
  )
}

test wallet_spend_accepts_forwarded_operator_use_rule() {
  let transaction = helpers.wallet_spend_tx(
    interval.between(0, 100),
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    fixtures.wallet_output(assets.from_lovelace(1_000_000)),
    [],
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test wallet_spend_rejects_no_wallet_rule() fail {
  // RenewProofOfLife carries no spend authorization → wallet must reject.
  let transaction = helpers.wallet_spend_tx(
    interval.between(0, 100),
    helpers.empty_state(),
    state_types.RenewProofOfLife,
    fixtures.wallet_output(assets.from_lovelace(1_000_000)),
    [],
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test wallet_spend_rejects_missing_forwarded_stt_input() fail {
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(0, 100),
    [],
    [
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(2_000_000),
      ),
    ],
    [
      helpers.stt_output_with_state(helpers.empty_state()),
      fixtures.wallet_output(assets.from_lovelace(1_000_000)),
    ],
    #"4130000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.operator_use_action(state_types.Admin),
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test wallet_spend_rejects_missing_forwarded_stt_output() fail {
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(0, 100),
    [],
    [
      helpers.stt_input_with_state(helpers.empty_state()),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(2_000_000),
      ),
    ],
    [fixtures.wallet_output(assets.from_lovelace(1_000_000))],
    #"4230000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.operator_use_action(state_types.Admin),
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test wallet_spend_rejects_missing_finite_upper_bound() fail {
  let transaction = helpers.wallet_spend_tx(
    interval.after(0),
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    fixtures.wallet_output(assets.from_lovelace(1_000_000)),
    [],
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test wallet_spend_rejects_underfunded_streaming_payments() fail {
  let output_state = fixtures.state(
    [],
    None,
    [],
    None,
    None,
    [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  )
  let transaction = helpers.wallet_spend_tx(
    interval.between(86_400_000, 86_400_000),
    output_state,
    fixtures.operator_use_action(state_types.Admin),
    fixtures.wallet_output(assets.from_lovelace(500_000)),
    [],
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
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
    run_reserve_spend(
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
    run_reserve_spend(
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
    run_reserve_spend(
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
    #"e230000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.consolidation_action(state_types.AdminPath),
  )
  expect run_reserve_spend(tx)
}

test streaming_payment_payout_accepts_exact_single_address_payout() {
  let transaction = helpers.streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(1_000_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    [],
    1_000_000,
    #"5130000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

// Regression for the wallet-side payout authorization list (audit M1). When a
// matured streaming payment is REMOVED in the output state, the STT still routes
// its full remaining amount to a tagged payout output for the now-absent id. The
// wallet validator must authorize that output against the INPUT-state streaming
// set (the same set the STT side iterates) — authorizing against the output set
// (where the id is gone) would misclassify the legitimate payout as a leak and
// make every matured-removal settlement unspendable, permanently stranding the
// final residual. The stream pays 1_000_000/day from start 0 to end 259_200_000
// (3 days) → lifetime_total 3_000_000; with paid_out 0 the removal settles the
// full 3_000_000 to the payee.
test streaming_payment_payout_accepts_matured_removal_settlement() {
  let input_state = fixtures.streaming_payment_payout_state(0)
  let output_state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let payout_delta = assets.from_lovelace(3_000_000)
    |> asset_entries.flatten_to_entries

  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(259_200_000, 259_200_000),
    [],
    [
      helpers.stt_input_with_state(input_state),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(5_000_000),
      ),
    ],
    [
      helpers.stt_output_with_state(output_state),
      fixtures.wallet_output(assets.from_lovelace(2_000_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(3_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    #"5630000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.streaming_payment_action(payout_delta),
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test streaming_payment_payout_rejects_tagged_id_at_other_streaming_payment_address() fail {
  let transaction = helpers.two_streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(2_000_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary2"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    [],
    1_000_000,
    #"5430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test streaming_payment_payout_rejects_extra_tagged_streaming_payment_output() fail {
  let transaction = helpers.two_streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(2_000_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary2"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        2,
      ),
    ],
    [],
    1_000_000,
    #"5530000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test streaming_payment_payout_rejects_payout_to_wrong_address() fail {
  let transaction = helpers.streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(1_000_000)),
      fixtures.payout_output(
        fixtures.address_from_key("attacker"),
        assets.from_lovelace(1_000_000),
      ),
    ],
    [],
    1_000_000,
    #"5230000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

test streaming_payment_payout_rejects_split_between_beneficiary_and_attacker() fail {
  let transaction = helpers.streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(500_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(500_000),
        fixtures.stt_input_ref(),
        1,
      ),
      fixtures.payout_output(
        fixtures.address_from_key("attacker"),
        assets.from_lovelace(1_000_000),
      ),
    ],
    [],
    1_500_000,
    #"5330000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}
