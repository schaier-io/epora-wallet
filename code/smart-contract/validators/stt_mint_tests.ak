//// Mint-path tests for the STT validator: asset-name derivation from a
//// consumed input, single-token enforcement, and state-payload validation at
//// mint (see `lib/stt/io.ak` and `validators/stt.ak::eval_mint`).

use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{InlineDatum, Output, Transaction}
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use stt
use stt/io as io
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/stt_test_helpers.{mint_transaction}

// The one helper that calls `stt.eval_mint` — binds the ignored redeemer and
// the fixture policy id (partial application, not a pure-forwarding wrapper).
fn run_stt_mint(tx: Transaction) -> Bool {
  stt.eval_mint(0, fixtures.default_policy_id(), tx)
}

test stt_mint_accepts_valid_inline_state_output() {
  let policy_id = #"aa"
  let asset_name = #"01"
  let state = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_non_admin_payout_at: None,
  }
  let stt_datum = state
  let output = Output {
    address: Address {
      payment_credential: Script(policy_id),
      stake_credential: None,
    },
    value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(policy_id, asset_name, 1),
    ),
    datum: InlineDatum(stt_datum),
    reference_script: None,
  }

  expect
    io.expect_minted_stt_state_and_asset_name([output], policy_id) == Pair(
      stt_datum,
      asset_name,
    )
}

test stt_mint_rejects_reference_script_on_stt_output() fail {
  let policy_id = #"aa"
  let asset_name = #"01"
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_non_admin_payout_at: None,
  }
  let output = Output {
    address: Address {
      payment_credential: Script(policy_id),
      stake_credential: None,
    },
    value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(policy_id, asset_name, 1),
    ),
    datum: InlineDatum(stt_datum),
    reference_script: Some(#"01"),
  }

  expect _ = io.expect_minted_stt_state_and_asset_name([output], policy_id)
}

// The minted STT output must be an enterprise address: spends forward the STT
// by FULL address, so a stake credential set at mint would be immutable forever
// (and a foreign one would capture the deposit's delegation). See audit B-4/B-1.
test stt_mint_rejects_stake_credential_on_stt_output() fail {
  let policy_id = #"aa"
  let asset_name = #"01"
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_non_admin_payout_at: None,
  }
  let output = Output {
    address: Address {
      payment_credential: Script(policy_id),
      stake_credential: Some(Inline(VerificationKey(#"a77ac6e7"))),
    },
    value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(policy_id, asset_name, 1),
    ),
    datum: InlineDatum(stt_datum),
    reference_script: None,
  }

  expect _ = io.expect_minted_stt_state_and_asset_name([output], policy_id)
}

test stt_mint_rejects_output_not_locked_at_stt_script() fail {
  let policy_id = #"aa"
  let asset_name = #"01"
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_non_admin_payout_at: None,
  }
  let output = Output {
    address: Address {
      payment_credential: Script(#"bb"),
      stake_credential: None,
    },
    value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(policy_id, asset_name, 1),
    ),
    datum: InlineDatum(stt_datum),
    reference_script: None,
  }

  expect _ = io.expect_minted_stt_state_and_asset_name([output], policy_id)
}

test stt_mint_rejects_wrong_asset_name_derivation() fail {
  let input_ref = fixtures.stt_input_ref()
  let wrong_asset_name = #"ff"
  let state = states.admin_state()
  let transaction = mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), wrong_asset_name, 1),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        state,
        fixtures.stt_value(
          fixtures.default_policy_id(),
          wrong_asset_name,
          2_000_000,
        ),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"6130"),
  )

  expect run_stt_mint(transaction)
}

test stt_mint_rejects_wrong_mint_quantity() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = states.admin_state()
  let stt_output = Output {
    ..fixtures.stt_output(
      fixtures.default_policy_id(),
      state,
      fixtures.stt_value(fixtures.default_policy_id(), asset_name, 2_000_000),
    ),
    value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(fixtures.default_policy_id(), asset_name, 2),
    ),
  }
  let transaction = mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), asset_name, 2),
    [stt_output],
    input_ref,
    fixtures.tx_id(#"6230"),
  )

  expect run_stt_mint(transaction)
}

test stt_mint_rejects_multiple_asset_names_under_policy() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = states.admin_state()
  let transaction = mint_transaction(
    assets.merge(
      assets.from_asset(fixtures.default_policy_id(), asset_name, 1),
      assets.from_asset(fixtures.default_policy_id(), #"02", 1),
    ),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        state,
        fixtures.stt_value(fixtures.default_policy_id(), asset_name, 2_000_000),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"6330"),
  )

  expect run_stt_mint(transaction)
}

test stt_mint_rejects_multiple_asset_names_in_stt_output() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = states.admin_state()
  let transaction = mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), asset_name, 1),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        state,
        assets.merge(
          fixtures.stt_value(
            fixtures.default_policy_id(),
            asset_name,
            2_000_000,
          ),
          assets.from_asset(fixtures.default_policy_id(), #"02", 1),
        ),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"6340"),
  )

  expect run_stt_mint(transaction)
}

test stt_mint_rejects_invalid_initial_state_configuration() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = states.base_state()
    |> states.with_users(
        [
          state_types.User {
            ..states.base_user(),
            id: 1,
            user_wallets: ["user1"],
          },
        ],
      )
  let transaction = mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), asset_name, 1),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        state,
        fixtures.stt_value(fixtures.default_policy_id(), asset_name, 2_000_000),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"6430"),
  )

  expect run_stt_mint(transaction)
}

test stt_mint_rejects_duplicate_streaming_payment_ids() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = states.base_state()
    |> states.with_users(
        [
          state_types.User {
            ..states.base_user(),
            user_wallets: ["admin"],
            is_admin: True,
          },
        ],
      )
    |> states.with_streaming_payments(
        [
          states.ada_streaming_payment_ending(1, "beneficiary1", 0, 100),
          states.ada_streaming_payment_ending(1, "beneficiary2", 0, 200),
        ],
      )
  let transaction = mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), asset_name, 1),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        state,
        fixtures.stt_value(fixtures.default_policy_id(), asset_name, 2_000_000),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"6530"),
  )

  expect run_stt_mint(transaction)
}

test stt_mint_rejects_invalid_streaming_payment_schedule() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = states.base_state()
    |> states.with_users(
        [
          state_types.User {
            ..states.base_user(),
            user_wallets: ["admin"],
            is_admin: True,
          },
        ],
      )
    |> states.with_streaming_payments(
        [
          // start_date == end_date is the violation under test — deliberately
          // NOT the canonical day-0 `ada_streaming_payment` schedule.
          StreamingPayment {
            ..states.base_streaming_payment(),
            id: 1,
            payout_address: fixtures.address_from_key("beneficiary1"),
            start_date: 200,
            end_date: 200,
          },
        ],
      )
  let transaction = mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), asset_name, 1),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        state,
        fixtures.stt_value(fixtures.default_policy_id(), asset_name, 2_000_000),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"6630"),
  )

  expect run_stt_mint(transaction)
}

// Cross-boundary lock on the STT asset-name derivation. The off-chain builder
// recomputes it independently in `offchain/lib/blueprint.mjs::sttAssetName`
// (blake2b_256 of transaction_id ++ 4-byte big-endian output_index), and
// `offchain/test/blueprint.test.mjs` pins this identical vector. Either side
// drifting fails a test here or there instead of producing an STT the validator
// refuses to spend.
test stt_asset_name_derivation_matches_offchain_vector() {
  io.output_reference_to_asset_name(fixtures.stt_input_ref()) == #"5c0a12f71dcc48f4c457a1a4a2ca08edf40841076d65481e4ab1a93c829c7e17"
}
