//// Address ingress and preservation through the STT entrypoints.

use aiken/interval
use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use stt/io
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/stt_test_helpers.{mint_transaction}

const full_payout_address: Address =
  Address {
    payment_credential: Script(fixtures.key_hash("payout-script")),
    stake_credential: Some(
      Inline(VerificationKey(fixtures.key_hash("payout-stake"))),
    ),
  }

fn configured_state(payout_address: Data) -> state_types.State {
  states.admin_state()
    |> states.with_beneficiaries(
        [
          state_types.Beneficiary {
            ..states.default_beneficiary(7, "beneficiary", Some(100)),
            payout_address,
          },
        ],
      )
    |> states.with_proof_of_life(100, 50)
}

fn mint_with_address(payout_address: Data) -> Transaction {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), asset_name, 1),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        configured_state(payout_address),
        fixtures.stt_value(fixtures.default_policy_id(), asset_name, 2_000_000),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"ba01"),
  )
}

fn update_with_address(payout_address: Data) -> Transaction {
  fixtures.stt_spend_tx(
    interval.between(0, 0),
    ["admin"],
    configured_state(full_payout_address),
    configured_state(payout_address),
    [],
    fixtures.tx_id(#"ba02"),
  )
}

const update_action: state_types.SttAction =
  state_types.RunOperator(
    state_types.OperatorAction {
      path: state_types.Admin,
      kind: state_types.UpdateState,
    },
  )

test beneficiary_address_mint_accepts_full_script_destination() {
  expect
    stt.eval_mint(
      0,
      fixtures.default_policy_id(),
      mint_with_address(full_payout_address),
    )
}

test beneficiary_address_mint_rejects_non_address_data() fail {
  expect stt.eval_mint(0, fixtures.default_policy_id(), mint_with_address(42))
}

test beneficiary_address_mint_rejects_malformed_payment_hash() fail {
  let malformed = Address {
    payment_credential: Script(#"01"),
    stake_credential: None,
  }
  expect
    stt.eval_mint(0, fixtures.default_policy_id(), mint_with_address(malformed))
}

test beneficiary_address_update_accepts_changed_full_destination() {
  expect
    stt.eval_spend(
      None,
      update_action,
      fixtures.stt_input_ref(),
      update_with_address(fixtures.address_from_key("new-destination")),
    )
}

test beneficiary_address_update_rejects_non_address_data() fail {
  expect
    stt.eval_spend(
      None,
      update_action,
      fixtures.stt_input_ref(),
      update_with_address(42),
    )
}

test beneficiary_address_update_rejects_malformed_stake_hash() fail {
  let malformed = Address {
    ..full_payout_address,
    stake_credential: Some(Inline(Script(#"01"))),
  }
  expect
    stt.eval_spend(
      None,
      update_action,
      fixtures.stt_input_ref(),
      update_with_address(malformed),
    )
}

test beneficiary_address_operator_use_preserves_encoded_destination() fail {
  let use_action = state_types.RunOperator(
    state_types.OperatorAction {
      path: state_types.Admin,
      kind: state_types.Use,
    },
  )
  expect
    stt.eval_spend(
      None,
      use_action,
      fixtures.stt_input_ref(),
      update_with_address(fixtures.address_from_key("new-destination")),
    )
}
