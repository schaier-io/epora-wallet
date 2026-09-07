use aiken/collection/list
use aiken/interval
use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets
use state/types.{Beneficiary, State} as state_types
use stt
use stt/io
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/stt_test_helpers.{mint_transaction}

fn policy_id() -> ByteArray {
  fixtures.policy_id("stt")
}

fn configured_state(payout_address: Address) -> State {
  states.admin_state()
    |> states.with_beneficiaries(
        [
          Beneficiary {
            ..states.default_beneficiary(7, "beneficiary", Some(100)),
            payout_address,
          },
        ],
      )
    |> states.with_proof_of_life(100, 50)
}

fn mint_state(state: State) -> Bool {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  stt.eval_mint(
    0,
    policy_id(),
    mint_transaction(
      assets.from_asset(policy_id(), asset_name, 1),
      [
        fixtures.stt_output(
          policy_id(),
          state,
          fixtures.stt_value(policy_id(), asset_name, 2_000_000),
        ),
      ],
      input_ref,
      fixtures.tx_id("mint"),
    ),
  )
}

fn update_state(input_state: State, output_state: State) -> Bool {
  let own_ref = fixtures.stt_input_ref()
  let value = fixtures.stt_value(
    policy_id(),
    fixtures.default_asset_name(),
    2_000_000,
  )
  stt.eval_spend(
    None,
    fixtures.operator_action(state_types.Admin, state_types.UpdateState),
    own_ref,
    fixtures.transaction(
      interval.after(0),
      ["admin"],
      [fixtures.stt_input(own_ref, policy_id(), input_state, value)],
      [fixtures.stt_output(policy_id(), output_state, value)],
      fixtures.tx_id("update"),
    ),
  )
}

fn stt_with_stake() -> Address {
  Address {
    payment_credential: Script(policy_id()),
    stake_credential: Some(Inline(VerificationKey(fixtures.key_hash("stake")))),
  }
}

fn supported_destinations() -> List<Address> {
  [
    fixtures.address_from_key("payee"),
    fixtures.script_address(fixtures.policy_id("payee")),
    Address {
      payment_credential: Script(fixtures.policy_id("payee")),
      stake_credential: Some(
        Inline(VerificationKey(fixtures.key_hash("stake"))),
      ),
    },
    Address {
      payment_credential: VerificationKey(policy_id()),
      stake_credential: None,
    },
  ]
}

test mint_rejects_beneficiary_stt_destination() fail {
  mint_state(configured_state(fixtures.stt_address(policy_id())))
}

test mint_rejects_beneficiary_stt_destination_with_stake() fail {
  mint_state(configured_state(stt_with_stake()))
}

test update_rejects_beneficiary_stt_destination() fail {
  update_state(
    states.admin_state(),
    configured_state(fixtures.stt_address(policy_id())),
  )
}

test update_rejects_beneficiary_stt_destination_with_stake() fail {
  update_state(states.admin_state(), configured_state(stt_with_stake()))
}

test mint_accepts_supported_beneficiary_destinations() {
  list.all(
    supported_destinations(),
    fn(address) { mint_state(configured_state(address)) },
  )
}

test update_accepts_supported_beneficiary_destinations() {
  list.all(
    supported_destinations(),
    fn(address) {
      update_state(states.admin_state(), configured_state(address))
    },
  )
}

test update_can_replace_an_incompatible_beneficiary_destination() {
  update_state(
    configured_state(stt_with_stake()),
    configured_state(fixtures.address_from_key("payee")),
  )
}
