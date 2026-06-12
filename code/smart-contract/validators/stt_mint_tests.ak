//// Mint-path tests for the STT validator: asset-name derivation from a
//// consumed input, single-token enforcement, and state-payload validation at
//// mint (see `lib/stt/io.ak` and `validators/stt.ak::eval_mint`).

use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{InlineDatum, Output}
use state/types as state_types
use stt
use stt/io as io
use test_support/security_fixtures as fixtures
use test_support/stt_test_helpers.{admin_state, mint_transaction}

test merged_stt_mint_accepts_valid_inline_state_output() {
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
    last_permissionless_payout_at: None,
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

test merged_stt_mint_rejects_reference_script_on_stt_output() fail {
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
    last_permissionless_payout_at: None,
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
test merged_stt_mint_rejects_stake_credential_on_stt_output() fail {
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
    last_permissionless_payout_at: None,
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

test merged_stt_mint_rejects_output_not_locked_at_stt_script() fail {
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
    last_permissionless_payout_at: None,
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

test merged_stt_mint_rejects_wrong_asset_name_derivation() fail {
  let input_ref = fixtures.stt_input_ref()
  let wrong_asset_name = #"ff"
  let state = admin_state()
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
    #"6130000000000000000000000000000000000000000000000000000000000000",
  )

  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}

test merged_stt_mint_rejects_wrong_mint_quantity() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = admin_state()
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
    #"6230000000000000000000000000000000000000000000000000000000000000",
  )

  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}

test merged_stt_mint_rejects_multiple_asset_names_under_policy() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = admin_state()
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
    #"6330000000000000000000000000000000000000000000000000000000000000",
  )

  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}

test merged_stt_mint_rejects_multiple_asset_names_in_stt_output() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = admin_state()
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
    #"6340000000000000000000000000000000000000000000000000000000000000",
  )

  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}

test merged_stt_mint_rejects_invalid_initial_state_configuration() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = fixtures.state(
    [fixtures.user(1, ["user1"], [], [], 0, False, None, False)],
    None,
    [],
    None,
    None,
    [],
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
    #"6430000000000000000000000000000000000000000000000000000000000000",
  )

  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}

test merged_stt_mint_rejects_duplicate_streaming_payment_ids() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = fixtures.state(
    [fixtures.user(0, ["admin"], [], [], 0, False, None, True)],
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
        100,
      ),
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary2"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        200,
      ),
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
    #"6530000000000000000000000000000000000000000000000000000000000000",
  )

  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}

test merged_stt_mint_rejects_invalid_streaming_payment_schedule() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = fixtures.state(
    [fixtures.user(0, ["admin"], [], [], 0, False, None, True)],
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
        200,
        200,
      ),
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
    #"6630000000000000000000000000000000000000000000000000000000000000",
  )

  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}
