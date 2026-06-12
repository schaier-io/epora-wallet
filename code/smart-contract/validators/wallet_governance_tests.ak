//// Wallet validator tests for the non-spend purposes: withdraw, publish,
//// vote (each forwarding an operator-use rule down the matching path), plus
//// the hard guarantee that the wallet never authorizes a mint.

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use state/types as state_types
use test_support/security_fixtures as fixtures
use test_support/wallet_test_helpers as helpers
use wallet

test wallet_withdraw_accepts_matching_operator_use_path() {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    #"4330000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_withdraw(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      fixtures.sample_credential(),
      transaction,
    )
}

test wallet_withdraw_rejects_wrong_operator_path() fail {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    #"4430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_withdraw(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Multisig,
      fixtures.sample_credential(),
      transaction,
    )
}

test wallet_withdraw_rejects_non_operator_witness() fail {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.allowance_action(
      assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
    ),
    #"4530000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_withdraw(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      fixtures.sample_credential(),
      transaction,
    )
}

test wallet_publish_accepts_matching_operator_use_path() {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    #"4630000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_publish(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      fixtures.sample_certificate(),
      transaction,
    )
}

test wallet_publish_rejects_no_wallet_rule() fail {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    state_types.RenewProofOfLife,
    #"4730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_publish(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      fixtures.sample_certificate(),
      transaction,
    )
}

// F-9: the Conway `vote` purpose is gated by the same operator-Use handshake as
// withdraw/publish (it replaced `propose`). Accepts when the STT ran operator
// Use on the matching path.
test wallet_vote_accepts_matching_operator_use_path() {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Multisig),
    #"4830000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_vote(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Multisig,
      fixtures.sample_voter(),
      transaction,
    )
}

// And rejects when the vote's claimed operator path does not match the path the
// STT actually authorized (STT ran Admin Use; vote claims Multisig).
test wallet_vote_rejects_wrong_witness_path() fail {
  let transaction = helpers.forwarded_only_tx(
    helpers.empty_state(),
    fixtures.operator_use_action(state_types.Admin),
    #"4930000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    wallet.eval_vote(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Multisig,
      fixtures.sample_voter(),
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
