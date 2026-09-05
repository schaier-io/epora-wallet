//// Wallet validator spend tests: forwarded operator-use rules, validity-range
//// guards, the per-asset streaming reserve (output >= min(input, reserve)),
//// and streaming-payment payout enforcement. All of these drive
//// `wallet.eval_spend` end to end, so `run_wallet_spend` — the one helper that
//// calls the validator — lives here rather than in the shared lib module.

use aiken/collection/list
use aiken/interval
use aiken/primitive/bytearray.{from_int_big_endian}
use assets/entries as asset_entries
use cardano/address.{Address, Inline, VerificationKey}
use cardano/assets
use cardano/transaction.{Input, Output, OutputReference, Transaction}
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/wallet_test_helpers as helpers
use wallet

// Binds the fixture policy/asset/stake/index/ref arguments (partial
// application), so this is not a pure-forwarding wrapper — a test's only
// remaining signal is its transaction.
fn run_wallet_spend(tx: Transaction) -> Bool {
  run_wallet_spend_at(fixtures.wallet_input_ref(), tx)
}

fn run_wallet_spend_at(own_ref: OutputReference, tx: Transaction) -> Bool {
  wallet.eval_spend(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    None,
    0,
    own_ref,
    tx,
  )
}

fn native_asset_value_from(
  first_asset_id: Int,
  asset_count: Int,
  quantity: Int,
  lovelace: Int,
) -> assets.Value {
  list.range(first_asset_id, first_asset_id + asset_count - 1)
    |> list.foldl(
        assets.from_lovelace(lovelace),
        fn(asset_id, value) {
          assets.add(
            value,
            fixtures.policy_id(#"ca"),
            from_int_big_endian(asset_id, 1),
            quantity,
          )
        },
      )
}

fn wallet_action_tx(
  input_state: state_types.State,
  output_state: state_types.State,
  action: state_types.SttAction,
  wallet_inputs: List<Input>,
  wallet_outputs: List<Output>,
  id: ByteArray,
) -> Transaction {
  fixtures.transaction_with_stt_redeemer(
    interval.between(110, 120),
    [],
    [helpers.stt_input_with_state(input_state), ..wallet_inputs],
    [helpers.stt_output_with_state(output_state), ..wallet_outputs],
    id,
    fixtures.stt_input_ref(),
    action,
  )
}

fn allowance_native_asset_cap_tx(asset_count: Int, id: ByteArray) -> Transaction {
  let input_value = native_asset_value_from(1, asset_count, 2, 10_000_000)
  let spent_value = assets.from_asset(
    fixtures.policy_id(#"ca"),
    from_int_big_endian(1, 1),
    1,
  )
  wallet_action_tx(
    helpers.empty_state(),
    helpers.empty_state(),
    fixtures.allowance_action(asset_entries.flatten_to_entries(spent_value)),
    [fixtures.wallet_input(fixtures.wallet_input_ref(), input_value)],
    [fixtures.wallet_output(assets.difference(input_value, spent_value))],
    id,
  )
}

fn beneficiary_native_asset_cap_tx(
  terminal: Bool,
  asset_count: Int,
  id: ByteArray,
) -> Transaction {
  let beneficiary = states.default_beneficiary(7, "beneficiary", Some(100))
  let input_state = states.base_state()
    |> states.with_users(
        if terminal {
          []
        } else {
          [states.admin_user("admin")]
        },
      )
    |> states.with_beneficiaries([beneficiary])
    |> states.with_proof_of_life(100, 50)
  let output_state = input_state |> states.with_beneficiaries([])
  wallet_action_tx(
    input_state,
    output_state,
    fixtures.beneficiary_action(beneficiary.id),
    [
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        native_asset_value_from(1, asset_count, 1, 10_000_000),
      ),
    ],
    [],
    id,
  )
}

fn stale_stake_two_input_without_stt() -> Transaction {
  let stale_wallet_address = Address {
    ..fixtures.wallet_script_address(),
    stake_credential: Some(Inline(VerificationKey(fixtures.key_hash(#"73")))),
  }
  fixtures.transaction(
    interval.between(50, 100),
    [],
    [
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(1_000_000),
      ),
      fixtures.external_input(
        fixtures.secondary_wallet_input_ref(),
        stale_wallet_address,
        assets.from_lovelace(1_000_000),
      ),
    ],
    [fixtures.wallet_output(assets.from_lovelace(2_000_000))],
    fixtures.tx_id(#"e231"),
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

  expect run_wallet_spend(transaction)
}

test allowance_spend_accepts_five_native_assets() {
  expect
    run_wallet_spend(allowance_native_asset_cap_tx(5, fixtures.tx_id(#"f130")))
}

test allowance_spend_rejects_six_native_assets() fail {
  expect
    run_wallet_spend(allowance_native_asset_cap_tx(6, fixtures.tx_id(#"f230")))
}

test nonterminal_beneficiary_accepts_five_native_assets() {
  expect
    run_wallet_spend(
      beneficiary_native_asset_cap_tx(False, 5, fixtures.tx_id(#"f330")),
    )
}

test nonterminal_beneficiary_rejects_six_native_assets() fail {
  expect
    run_wallet_spend(
      beneficiary_native_asset_cap_tx(False, 6, fixtures.tx_id(#"f430")),
    )
}

test terminal_beneficiary_accepts_full_sweep_over_native_asset_cap() {
  expect
    run_wallet_spend(
      beneficiary_native_asset_cap_tx(True, 6, fixtures.tx_id(#"f530")),
    )
}

test operator_cleanup_accepts_over_cap_input_and_keeps_active_stream_reserve() {
  let policy_id = fixtures.policy_id(#"ca")
  let reserved_asset_name = from_int_big_endian(1, 1)
  let input_value = native_asset_value_from(1, 6, 2, 10_000_000)
  let output_value = assets.from_lovelace(10_000_000)
    |> assets.add(policy_id, reserved_asset_name, 1)

  expect
    run_wallet_spend(
      helpers.admin_use_reserve_tx(
        helpers.reserve_state_with_sp(policy_id, reserved_asset_name),
        input_value,
        output_value,
      ),
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

  expect run_wallet_spend(transaction)
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
    fixtures.tx_id(#"4130"),
    fixtures.stt_input_ref(),
    fixtures.operator_use_action(state_types.Admin),
  )

  expect run_wallet_spend(transaction)
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
    fixtures.tx_id(#"4230"),
    fixtures.stt_input_ref(),
    fixtures.operator_use_action(state_types.Admin),
  )

  expect run_wallet_spend(transaction)
}

test wallet_spend_rejects_missing_finite_upper_bound() fail {
  let transaction = helpers.wallet_spend_tx(
    interval.after(0),
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    fixtures.wallet_output(assets.from_lovelace(1_000_000)),
    [],
  )

  expect run_wallet_spend(transaction)
}

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

  expect run_wallet_spend(transaction)
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
    run_wallet_spend(
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
    run_wallet_spend(
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
    run_wallet_spend(
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
  expect run_wallet_spend(tx)
}

test wallet_spend_rejects_two_wallet_inputs_outside_consolidation() fail {
  let state = helpers.empty_state()
  let tx = fixtures.transaction_with_stt_redeemer(
    interval.between(50, 100),
    [fixtures.key_hash("admin")],
    [
      helpers.stt_input_with_state(state),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(1_000_000),
      ),
      fixtures.wallet_input(
        fixtures.secondary_wallet_input_ref(),
        assets.from_lovelace(1_000_000),
      ),
    ],
    [
      helpers.stt_output_with_state(state),
      fixtures.wallet_output(assets.from_lovelace(2_000_000)),
    ],
    fixtures.tx_id(#"e330"),
    fixtures.stt_input_ref(),
    fixtures.operator_use_action(state_types.Admin),
  )

  expect run_wallet_spend(tx)
}

// Every same-payment-credential input sees the same leader even when stake
// credentials differ. This nonleader may stop after the absolute group cap;
// the ledger also evaluates the leader, whose companion test below rejects the
// missing STT and therefore rejects the transaction as a whole.
test wallet_stale_stake_nonleader_defers_full_checks_to_group_leader() {
  expect
    run_wallet_spend_at(
      fixtures.secondary_wallet_input_ref(),
      stale_stake_two_input_without_stt(),
    )
}

test wallet_group_leader_still_requires_full_checks() fail {
  expect run_wallet_spend(stale_stake_two_input_without_stt())
}

test wallet_consolidation_accepts_two_wallet_inputs() {
  let state = helpers.empty_state()
  let tx = fixtures.transaction_with_stt_redeemer(
    interval.between(50, 100),
    [fixtures.key_hash("admin")],
    [
      helpers.stt_input_with_state(state),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(1_000_000),
      ),
      fixtures.wallet_input(
        fixtures.secondary_wallet_input_ref(),
        assets.from_lovelace(1_000_000),
      ),
    ],
    [
      helpers.stt_output_with_state(state),
      fixtures.wallet_output(assets.from_lovelace(2_000_000)),
    ],
    fixtures.tx_id(#"e430"),
    fixtures.stt_input_ref(),
    fixtures.consolidation_action(state_types.AdminPath),
  )

  expect run_wallet_spend(tx)
  expect run_wallet_spend_at(fixtures.secondary_wallet_input_ref(), tx)
}

test wallet_consolidation_rejects_aggregate_native_asset_union_over_cap() fail {
  let state = helpers.empty_state()
  let first_value = native_asset_value_from(1, 3, 1, 2_000_000)
  let second_value = native_asset_value_from(4, 3, 1, 2_000_000)
  let tx = wallet_action_tx(
    state,
    state,
    fixtures.consolidation_action(state_types.AdminPath),
    [
      fixtures.wallet_input(fixtures.wallet_input_ref(), first_value),
      fixtures.wallet_input(fixtures.secondary_wallet_input_ref(), second_value),
    ],
    [fixtures.wallet_output(first_value), fixtures.wallet_output(second_value)],
    fixtures.tx_id(#"f630"),
  )

  expect run_wallet_spend(tx)
}

test wallet_consolidation_rejects_three_wallet_inputs() fail {
  let state = helpers.empty_state()
  let third_wallet_input_ref = fixtures.output_ref(fixtures.tx_id(#"6430"), 2)
  let tx = fixtures.transaction_with_stt_redeemer(
    interval.between(50, 100),
    [fixtures.key_hash("admin")],
    [
      helpers.stt_input_with_state(state),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(1_000_000),
      ),
      fixtures.wallet_input(
        fixtures.secondary_wallet_input_ref(),
        assets.from_lovelace(1_000_000),
      ),
      fixtures.wallet_input(
        third_wallet_input_ref,
        assets.from_lovelace(1_000_000),
      ),
    ],
    [
      helpers.stt_output_with_state(state),
      fixtures.wallet_output(assets.from_lovelace(3_000_000)),
    ],
    fixtures.tx_id(#"e530"),
    fixtures.stt_input_ref(),
    fixtures.consolidation_action(state_types.AdminPath),
  )

  expect run_wallet_spend(tx)
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
    fixtures.tx_id(#"5130"),
  )

  expect run_wallet_spend(transaction)
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
  let input_state = states.streaming_payment_payout_state(0)
  let output_state = states.admin_state()
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
    fixtures.tx_id(#"5630"),
    fixtures.stt_input_ref(),
    fixtures.streaming_payment_action(payout_delta),
  )

  expect run_wallet_spend(transaction)
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
    fixtures.tx_id(#"5430"),
  )

  expect run_wallet_spend(transaction)
}

// An EXTRA tagged output to a *configured* payee, beyond the declared delta, is
// permitted (security review 2026-07: the ada min-UTxO top-up relaxation). The
// wallet funds 3M in − 2M returned = 1M, exactly the declared delta; the second
// tagged output (ben2, id 2) carries 1M that the WALLET did not release, so it is
// cranker-funded. Safety holds without the old exact-sum equality: the wallet's
// own outflow is still pinned to the delta (`output == input - payout_delta`), and
// every ada output is a wallet/STT/tagged destination (no leak). The surplus reaches
// a configured payee only. (The STT validator independently pins each stream's
// tagged output to at least its settled amount; here it is not exercised — this
// test drives only `wallet.eval_spend`.)
test streaming_payment_payout_allows_cranker_funded_extra_tagged_output() {
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
    fixtures.tx_id(#"5530"),
  )

  expect run_wallet_spend(transaction)
}

// Core of the ada min-UTxO top-up fix (security review 2026-07). An ada-denominated
// settlement whose accrued delta (0.3 ada) is below the ledger min-UTxO cannot emit
// an exact-delta payee output — such a UTxO is unconstructible. The crank tops the
// payee output up to a valid 1.5-ada UTxO with its OWN ada. The wallet still releases
// exactly the 0.3-ada delta (2M in − 1.7M returned == 300_000 == declared delta); the
// 1.2M surplus in the tagged output is cranker-funded. Before the relaxation the
// exact-sum check (`tagged == delta`) rejected this and the stream could not settle
// until it had accrued a full min-UTxO's worth.
test streaming_payment_payout_allows_ada_topup_to_clear_min_utxo() {
  let transaction = helpers.streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(1_700_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_500_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    [],
    300_000,
    fixtures.tx_id(#"5730"),
  )

  expect run_wallet_spend(transaction)
}

// The top-up relaxation must NOT let the WALLET itself pay out more than the declared
// delta: `>=` governs only how much may LAND in tagged outputs (cranker top-up), while
// `output == input - payout_delta` still pins the wallet's own outflow. Here
// the wallet releases 2M − 0.5M = 1.5M but declares a 1M delta, so it is rejected even
// though the sole extra destination is a correctly-tagged, configured payee.
test streaming_payment_payout_rejects_wallet_outflow_above_declared_delta() fail {
  let transaction = helpers.streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(500_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_500_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    [],
    1_000_000,
    fixtures.tx_id(#"5830"),
  )

  expect run_wallet_spend(transaction)
}

// Non-ada streams keep EXACT routing: the `>=` top-up carve-out is conditioned on
// the payout asset being ada. A token payee UTxO pads its min-UTxO in ada (a
// different asset), so a token has no min-UTxO obstacle and no reason to relax; the
// `==` branch also stops a token being shuffled between same-token payees. Here the
// wallet holds 2M token, keeps 1M, releases 1M == the declared token delta, but the
// tagged output carries 1.5M token (0.5M over) — rejected by the token `==` branch
// (the reserve and `paid_out == delta` checks both pass, so this isolates conjunct 3).
test streaming_payment_payout_rejects_token_overpay_in_tagged_output() fail {
  let token_policy = #"bb"
  let token_name = #"544f4b454e"
  let input_state = states.base_state()
    |> states.with_users([states.admin_user("admin")])
    |> states.with_proof_of_life(100, 50)
    |> states.with_streaming_payments(
        [
          StreamingPayment {
            ..states.base_streaming_payment(),
            id: 1,
            payout_address: fixtures.address_from_key("beneficiary1"),
            policy_id: token_policy,
            asset_name: token_name,
          },
        ],
      )
  let output_state = states.base_state()
    |> states.with_users([states.admin_user("admin")])
    |> states.with_proof_of_life(100, 50)
    |> states.with_streaming_payments(
        [
          StreamingPayment {
            ..states.base_streaming_payment(),
            id: 1,
            payout_address: fixtures.address_from_key("beneficiary1"),
            paid_out_amount: 1_000_000,
            policy_id: token_policy,
            asset_name: token_name,
          },
        ],
      )
  let payout_delta = assets.from_asset(token_policy, token_name, 1_000_000)
    |> asset_entries.flatten_to_entries
  let wallet_in_value = assets.merge(
    assets.from_lovelace(2_000_000),
    assets.from_asset(token_policy, token_name, 2_000_000),
  )
  let wallet_out_value = assets.merge(
    assets.from_lovelace(2_000_000),
    assets.from_asset(token_policy, token_name, 1_000_000),
  )
  let tagged_value = assets.merge(
    assets.from_lovelace(1_500_000),
    assets.from_asset(token_policy, token_name, 1_500_000),
  )
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(86_400_000, 86_400_000),
    [],
    [
      helpers.stt_input_with_state(input_state),
      fixtures.wallet_input(fixtures.wallet_input_ref(), wallet_in_value),
    ],
    [
      helpers.stt_output_with_state(output_state),
      fixtures.wallet_output(wallet_out_value),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        tagged_value,
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    fixtures.tx_id(#"5930"),
    fixtures.stt_input_ref(),
    fixtures.streaming_payment_action(payout_delta),
  )

  expect run_wallet_spend(transaction)
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
    fixtures.tx_id(#"5230"),
  )

  expect run_wallet_spend(transaction)
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
    fixtures.tx_id(#"5330"),
  )

  expect run_wallet_spend(transaction)
}

// End-to-end confirmation of the "ADA settlement granularity and fee funding"
// constraint (security review 2026-07): a wallet-funded ADA settlement may NOT
// carry the cranker's own untagged change output. Every output carries min-ADA,
// so an untagged third-party change output holds the payout lovelace and is an
// illegal destination under the airtight anti-leak scan. The cranker's funding
// input has only two legal ada sinks — the tagged payee output (top-up) and the
// tx fee — and must split across them with no residual returned (the fee is NOT
// "== input" once a top-up is present). Here the extra output is an untagged
// change output, so it is rejected — keeping the guarantee airtight.
test streaming_payment_payout_rejects_cranker_lovelace_change_output() fail {
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
    [
      fixtures.payout_output(
        fixtures.address_from_key("cranker"),
        assets.from_lovelace(5_000_000),
      ),
    ],
    1_000_000,
    fixtures.tx_id(#"5a30"),
  )

  expect run_wallet_spend(transaction)
}

// End-to-end anti-fragmentation: an otherwise-valid crank (exact delta, exact
// tagged payout) that splits ONE consumed wallet UTxO into TWO continuing
// wallet outputs is rejected — a cranker may keep or shrink the
// wallet's UTxO count, never grow it (security review 2026-07).
test streaming_payment_payout_rejects_wallet_utxo_fragmentation() fail {
  let transaction = helpers.streaming_payment_payout_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(500_000)),
      fixtures.wallet_output(assets.from_lovelace(500_000)),
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    [],
    1_000_000,
    fixtures.tx_id(#"5b30"),
  )

  expect run_wallet_spend(transaction)
}

// Security review 2026-07 (Medium): the wallet had no counterpart to the STT's
// reference-script ban (guard G2), and the crank's submitter — who need not be
// the owner — chooses the continuing wallet output's fields. Attaching a
// reference script there is charged per byte on every later spend of that UTxO
// and counts toward the per-tx reference-script size limit, so repeated cranks
// could bloat the wallet's UTxO set until a ONE-SHOT `UseBeneficiary` sweep no
// longer fits in one transaction. Now REJECTED. Everything else about this crank
// is the exact transaction `streaming_payment_payout_accepts_*` accepts, so the
// reference script is the sole reason for rejection.
test streaming_payment_payout_rejects_reference_script_on_wallet_output() fail {
  let transaction = helpers.streaming_payment_payout_tx(
    [
      Output {
        ..fixtures.wallet_output(assets.from_lovelace(1_000_000)),
        reference_script: Some(#"01"),
      },
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    [],
    1_000_000,
    fixtures.tx_id(#"5c30"),
  )

  expect run_wallet_spend(transaction)
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

  expect run_wallet_spend(transaction)
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

  expect run_wallet_spend(transaction)
}
