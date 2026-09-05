//// STT spend value-preservation tests: every forwarded output contains only
//// lovelace plus the STT. Non-admin paths may only top up lovelace, while admin
//// Use may also reduce it (see `lib/stt/io.ak`).

use aiken/interval
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/stt_test_helpers.{beneficiary_state}

// The one helper that calls `stt.eval_spend` — binds the fixture datum and
// input ref (partial application, not a pure-forwarding wrapper).
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

test stt_spend_admin_operator_use_cleans_legacy_non_lovelace_asset() {
  let input_state = states.admin_state()
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let input_value = assets.merge(
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    assets.from_asset(#"cc", #"01", 5),
  )
  let output_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"6730"),
  )

  expect
    run_stt_spend(fixtures.operator_use_action(state_types.Admin), transaction)
}

test stt_spend_admin_operator_use_rejects_non_lovelace_asset_in_output() fail {
  let input_state = states.admin_state()
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let input_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let output_value = assets.merge(
    input_value,
    assets.from_asset(#"cc", #"01", 1),
  )
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"6731"),
  )

  expect
    run_stt_spend(fixtures.operator_use_action(state_types.Admin), transaction)
}

test stt_spend_admin_operator_use_accepts_lovelace_drop() {
  let input_state = states.admin_state()
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_500_000,
    ),
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    [],
    fixtures.tx_id(#"6732"),
  )

  expect
    run_stt_spend(fixtures.operator_use_action(state_types.Admin), transaction)
}

test stt_spend_admin_operator_use_accepts_lovelace_topup() {
  let input_state = states.admin_state()
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_500_000,
    ),
    [],
    fixtures.tx_id(#"6733"),
  )

  expect
    run_stt_spend(fixtures.operator_use_action(state_types.Admin), transaction)
}

test stt_spend_allows_unrelated_mint() {
  let input_state = states.admin_state()
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let unrelated_policy_id = #"dd"
  let unrelated_asset_name = #"02"
  let transaction = fixtures.stt_spend_tx_with_mint(
    assets.from_asset(unrelated_policy_id, unrelated_asset_name, 1),
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    [
      fixtures.payout_output(
        fixtures.address_from_key("minter"),
        assets.from_asset(unrelated_policy_id, unrelated_asset_name, 1),
      ),
    ],
    fixtures.tx_id(#"7630"),
  )

  expect
    run_stt_spend(fixtures.operator_use_action(state_types.Admin), transaction)
}

// The validator's `assets.match` checks only constrain lovelace direction
// (non-lovelace deltas are independently forbidden by exact equality inside
// `assets.match`). The four tests below pin down that the operator is `>=`
// in BOTH the operator-else branch and the wildcard branch by toggling
// lovelace up/down with otherwise fully valid transitions.

// Else branch (Admin + UpdateState): lovelace top-up must be accepted.
// Catches accidental `<=` or `==` on the operator-else branch.
test stt_spend_else_branch_accepts_lovelace_topup() {
  let state = states.admin_state()
  let input_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let output_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_500_000,
  )
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7730"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test stt_spend_admin_update_accepts_wallet_name_change() {
  let input_state = states.admin_state()
  let output_state = state_types.State { ..input_state, wallet_name: #"0102" }
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    [],
    fixtures.tx_id(#"7731"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test stt_spend_multisig_update_rejects_wallet_name_change() fail {
  let input_state = states.secured_state(
    [
      state_types.User {
        ..states.base_user(),
        id: 1,
        user_wallets: [fixtures.key_hash("multisig")],
        multi_sig_power: Some(2),
      },
    ],
    [],
    [],
  )
  let output_state = state_types.State { ..input_state, wallet_name: #"0102" }
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(0),
    ["multisig"],
    input_state,
    output_state,
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    [],
    fixtures.tx_id(#"7732"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Multisig, state_types.UpdateState),
      transaction,
    )
}

// Else branch: lovelace withdrawal must be rejected.
// Catches accidental `<=` (which would accept a drain).
test stt_spend_else_branch_rejects_lovelace_drop() fail {
  let state = states.admin_state()
  let input_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let output_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    1_500_000,
  )
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7830"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

// Wildcard branch (UseBeneficiary): lovelace top-up must be accepted.
// Catches accidental `<=` or `==` on the wildcard branch.
test stt_spend_wildcard_branch_accepts_lovelace_topup() {
  let input_state = beneficiary_state()
  // UseBeneficiary removes the acting beneficiary from the forwarded state.
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      ..input_state.access,
      beneficiaries: [],
    },
  }
  let input_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let output_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_500_000,
  )
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    output_state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7930"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

// Wildcard branch: lovelace withdrawal must be rejected.
// Catches accidental `<=` on the wildcard branch.
test stt_spend_wildcard_branch_rejects_lovelace_drop() fail {
  let state = beneficiary_state()
  let input_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let output_value = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    1_500_000,
  )
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(120),
    ["beneficiary1"],
    state,
    state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7a30"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

// Non-lovelace assets must remain exactly equal between input and output STT
// outputs (enforced by `assets.match`). The four tests below exercise that
// constraint on both branches by adding or removing a non-lovelace asset
// while keeping lovelace and the rest of the transition fully valid.

test stt_spend_else_branch_rejects_added_non_lovelace_asset() fail {
  let state = states.admin_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = lovelace
  let output_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7b30"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test stt_spend_else_branch_rejects_removed_non_lovelace_asset() fail {
  let state = states.admin_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let output_value = lovelace
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7c30"),
  )

  expect
    run_stt_spend(
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      transaction,
    )
}

test stt_spend_wildcard_branch_rejects_added_non_lovelace_asset() fail {
  let state = beneficiary_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = lovelace
  let output_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(120),
    ["beneficiary1"],
    state,
    state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7d30"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

test stt_spend_wildcard_branch_rejects_removed_non_lovelace_asset() fail {
  let state = beneficiary_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let output_value = lovelace
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.after(120),
    ["beneficiary1"],
    state,
    state,
    input_value,
    output_value,
    [],
    fixtures.tx_id(#"7e30"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}
