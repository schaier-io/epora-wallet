//// STT spend value-preservation tests: lovelace may be topped up while every
//// non-lovelace asset stays exactly equal across the STT transition (see
//// `lib/stt/io.ak::stt_value_preserved_or_increased`).

use aiken/interval
use cardano/assets
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/stt_test_helpers.{
  admin_state, beneficiary_state, spend_transaction, spend_transaction_with_mint,
}

test merged_stt_spend_admin_operator_use_allows_non_lovelace_asset_change() {
  let input_state = admin_state()
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(120),
      increment: Some(50),
    },
  }
  let input_value = assets.merge(
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    assets.from_asset(#"cc", #"01", 5),
  )
  let output_value = assets.merge(
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      2_000_000,
    ),
    assets.from_asset(#"cc", #"01", 1),
  )
  let transaction = spend_transaction(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    input_value,
    output_value,
    [],
    #"6730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.Use,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test merged_stt_spend_allows_unrelated_mint() {
  let input_state = admin_state()
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(120),
      increment: Some(50),
    },
  }
  let unrelated_policy_id = #"dd"
  let unrelated_asset_name = #"02"
  let transaction = spend_transaction_with_mint(
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
    #"7630000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.Use,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// The validator's `assets.match` checks only constrain lovelace direction
// (non-lovelace deltas are independently forbidden by exact equality inside
// `assets.match`). The four tests below pin down that the operator is `>=`
// in BOTH the operator-else branch and the wildcard branch by toggling
// lovelace up/down with otherwise fully valid transitions.

// Else branch (Admin + UpdateState): lovelace top-up must be accepted.
// Catches accidental `<=` or `==` on the operator-else branch.
test merged_stt_spend_else_branch_accepts_lovelace_topup() {
  let state = admin_state()
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
  let transaction = spend_transaction(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"7730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.UpdateState,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test merged_stt_spend_admin_update_accepts_wallet_name_change() {
  let input_state = admin_state()
  let output_state = state_types.State { ..input_state, wallet_name: #"0102" }
  let transaction = spend_transaction(
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
    #"7731000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.UpdateState,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test merged_stt_spend_multisig_update_rejects_wallet_name_change() fail {
  let input_state = fixtures.state(
    [fixtures.user(1, ["multisig"], [], [], 0, False, Some(2), False)],
    Some(2),
    [],
    Some(100),
    Some(50),
    [],
  )
  let output_state = state_types.State { ..input_state, wallet_name: #"0102" }
  let transaction = spend_transaction(
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
    #"7732000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Multisig,
          kind: state_types.UpdateState,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// Else branch: lovelace withdrawal must be rejected.
// Catches accidental `<=` (which would accept a drain).
test merged_stt_spend_else_branch_rejects_lovelace_drop() fail {
  let state = admin_state()
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
  let transaction = spend_transaction(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"7830000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.UpdateState,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// Wildcard branch (UseBeneficiary): lovelace top-up must be accepted.
// Catches accidental `<=` or `==` on the wildcard branch.
test merged_stt_spend_wildcard_branch_accepts_lovelace_topup() {
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
  let transaction = spend_transaction(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    output_state,
    input_value,
    output_value,
    [],
    #"7930000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// Wildcard branch: lovelace withdrawal must be rejected.
// Catches accidental `<=` on the wildcard branch.
test merged_stt_spend_wildcard_branch_rejects_lovelace_drop() fail {
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
  let transaction = spend_transaction(
    interval.after(120),
    ["beneficiary1"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"7a30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// Non-lovelace assets must remain exactly equal between input and output STT
// outputs (enforced by `assets.match`). The four tests below exercise that
// constraint on both branches by adding or removing a non-lovelace asset
// while keeping lovelace and the rest of the transition fully valid.

test merged_stt_spend_else_branch_rejects_added_non_lovelace_asset() fail {
  let state = admin_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = lovelace
  let output_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let transaction = spend_transaction(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"7b30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.UpdateState,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test merged_stt_spend_else_branch_rejects_removed_non_lovelace_asset() fail {
  let state = admin_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let output_value = lovelace
  let transaction = spend_transaction(
    interval.after(0),
    ["admin"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"7c30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.UpdateState,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test merged_stt_spend_wildcard_branch_rejects_added_non_lovelace_asset() fail {
  let state = beneficiary_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = lovelace
  let output_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let transaction = spend_transaction(
    interval.after(120),
    ["beneficiary1"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"7d30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test merged_stt_spend_wildcard_branch_rejects_removed_non_lovelace_asset() fail {
  let state = beneficiary_state()
  let lovelace = fixtures.stt_value(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  let input_value = assets.merge(lovelace, assets.from_asset(#"cc", #"01", 1))
  let output_value = lovelace
  let transaction = spend_transaction(
    interval.after(120),
    ["beneficiary1"],
    state,
    state,
    input_value,
    output_value,
    [],
    #"7e30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}
