//// Wallet validator tests for the non-spend purposes. `withdraw`, `publish`,
//// and `vote` share ONE authorization gate — `eval_governance_operator_use` —
//// so they are covered once, here, against that gate directly (the purposes
//// only differ by an ignored payload; see `wallet.ak`). Also covers the hard
//// guarantee that the wallet never authorizes a mint.

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use state/types as state_types
use test_support/security_fixtures as fixtures
use test_support/wallet_test_helpers as helpers
use wallet

// Accepts when the STT ran operator `Use` on the claimed Admin path.
test governance_gate_accepts_matching_admin_path() {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    #"4330000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_governance_operator_use(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      transaction,
    )
}

// Accepts on the Multisig path too (F-9: the Conway `vote` purpose, which
// replaced `propose`, rides the same gate).
test governance_gate_accepts_matching_multisig_path() {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Multisig),
    #"4830000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_governance_operator_use(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Multisig,
      transaction,
    )
}

// Rejects when the claimed path differs from the one the STT authorized (STT
// ran Admin `Use`; the governance purpose claims Multisig).
test governance_gate_rejects_mismatched_path() fail {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    #"4430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_governance_operator_use(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Multisig,
      transaction,
    )
}

// Rejects when the STT action is not an operator `Use` at all — here an
// allowance spend.
test governance_gate_rejects_non_operator_use_allowance_action() fail {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.allowance_action(
      assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
    ),
    #"4530000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_governance_operator_use(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      transaction,
    )
}

// Rejects another non-operator-`Use` action — a proof-of-life renewal — so the
// gate is pinned against more than one wrong redeemer variant.
test governance_gate_rejects_non_operator_use_renew_action() fail {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    state_types.RenewProofOfLife,
    #"4730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_governance_operator_use(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      transaction,
    )
}

test wallet_mint_hard_fails() fail {
  expect
    wallet.eval_mint(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      0,
      fixtures.default_policy_id(),
      fixtures.transaction(
        interval.after(0),
        [],
        [],
        [],
        #"5030000000000000000000000000000000000000000000000000000000000000",
      ),
    )
}
