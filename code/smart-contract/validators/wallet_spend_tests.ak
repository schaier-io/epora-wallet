//// Wallet validator spend tests: forwarded operator-use rules, validity-range
//// guards, the per-asset streaming reserve (output >= min(input, reserve)),
//// and streaming-payment payout enforcement. All of these drive
//// `wallet.eval_spend` end to end, so `run_wallet_spend` — the one helper that
//// calls the validator — lives here rather than in the shared lib module.

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use test_support/intent_fixtures as intent
use test_support/security_fixtures as fixtures
use test_support/wallet_test_helpers as helpers
use wallet

// Binds the fixture policy/asset/stake/index/ref arguments (partial
// application), so this is not a pure-forwarding wrapper — a test's only
// remaining signal is its transaction.
fn run_wallet_spend(tx: Transaction) -> Bool {
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

  expect run_wallet_spend(transaction)
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
    #"4130000000000000000000000000000000000000000000000000000000000000",
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
    #"4230000000000000000000000000000000000000000000000000000000000000",
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
  let output_state = fixtures.state(
    [],
    None,
    [],
    None,
    None,
    [intent.ada_streaming_payment(1, "beneficiary1", 0)],
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
    #"e230000000000000000000000000000000000000000000000000000000000000",
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
    #"5130000000000000000000000000000000000000000000000000000000000000",
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
  let input_state = fixtures.streaming_payment_payout_state(0)
  let output_state = fixtures.admin_state()
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
    #"5430000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_wallet_spend(transaction)
}

// An EXTRA tagged output to a *configured* payee, beyond the declared delta, is
// permitted (security review 2026-07: the ada min-UTxO top-up relaxation). The
// wallet funds 3M in − 2M returned = 1M, exactly the declared delta; the second
// tagged output (ben2, id 2) carries 1M that the WALLET did not release, so it is
// cranker-funded. Safety holds without the old exact-sum equality: the wallet's
// own outflow is still pinned to the delta (`paid_out_value == payout_delta`), and
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
    #"5530000000000000000000000000000000000000000000000000000000000000",
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
    #"5730000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_wallet_spend(transaction)
}

// The top-up relaxation must NOT let the WALLET itself pay out more than the declared
// delta: `>=` governs only how much may LAND in tagged outputs (cranker top-up), while
// `paid_out_value == payout_delta` still pins the wallet's own outflow exactly. Here
// the wallet releases 2M − 0.5M = 1.5M but declares a 1M delta, so it is rejected even
// though the sole extra recipient is a correctly-tagged, configured payee.
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
    #"5830000000000000000000000000000000000000000000000000000000000000",
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
  let input_state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        0,
        token_policy,
        token_name,
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  )
  let output_state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        1_000_000,
        token_policy,
        token_name,
        1_000_000,
        0,
        259_200_000,
      ),
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
    #"5930000000000000000000000000000000000000000000000000000000000000",
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
    #"5230000000000000000000000000000000000000000000000000000000000000",
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
    #"5330000000000000000000000000000000000000000000000000000000000000",
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
    #"5a30000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_wallet_spend(transaction)
}

// End-to-end anti-fragmentation: an otherwise-valid crank (exact delta, exact
// tagged payout) that splits ONE consumed wallet UTxO into TWO continuing
// wallet outputs is rejected — a permissionless cranker may keep or shrink the
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
    #"5b30000000000000000000000000000000000000000000000000000000000000",
  )

  expect run_wallet_spend(transaction)
}
