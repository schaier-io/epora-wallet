//// Beneficiary destinations use the existing full-address configuration rules.

use aiken/cbor
use aiken/primitive/bytearray
use cardano/address.{Address, Inline, Pointer, Script, VerificationKey}
use state/configuration
use state/types.{Beneficiary, State}
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

const payment_hash: ByteArray =
  #"01010101010101010101010101010101010101010101010101010101"

const stake_hash: ByteArray =
  #"02020202020202020202020202020202020202020202020202020202"

fn configured_state(payout_address: Address) -> State {
  states.base_state()
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

test beneficiary_payout_accepts_key_enterprise_address() {
  expect
    configuration.expect_valid_state_configuration(
      configured_state(fixtures.address_from_key(payment_hash)),
    )
}

test beneficiary_payout_accepts_script_enterprise_address() {
  expect
    configuration.expect_valid_state_configuration(
      configured_state(fixtures.script_address(payment_hash)),
    )
}

test beneficiary_payout_accepts_key_payment_and_script_stake() {
  expect
    configuration.expect_valid_state_configuration(
      configured_state(
        Address {
          payment_credential: VerificationKey(payment_hash),
          stake_credential: Some(Inline(Script(stake_hash))),
        },
      ),
    )
}

test beneficiary_payout_accepts_script_payment_and_key_stake() {
  expect
    configuration.expect_valid_state_configuration(
      configured_state(
        Address {
          payment_credential: Script(payment_hash),
          stake_credential: Some(Inline(VerificationKey(stake_hash))),
        },
      ),
    )
}

test beneficiary_payout_rejects_short_payment_hash() fail {
  expect
    configuration.expect_valid_state_configuration(
      configured_state(
        Address {
          payment_credential: VerificationKey(
            bytearray.from_int_big_endian(1, 27),
          ),
          stake_credential: None,
        },
      ),
    )
}

test beneficiary_payout_rejects_long_stake_hash() fail {
  expect
    configuration.expect_valid_state_configuration(
      configured_state(
        Address {
          payment_credential: Script(payment_hash),
          stake_credential: Some(
            Inline(Script(bytearray.from_int_big_endian(1, 29))),
          ),
        },
      ),
    )
}

test beneficiary_payout_rejects_pointer_stake() fail {
  expect
    configuration.expect_valid_state_configuration(
      configured_state(
        Address {
          payment_credential: VerificationKey(payment_hash),
          stake_credential: Some(
            Pointer {
              slot_number: 1,
              transaction_index: 0,
              certificate_index: 0,
            },
          ),
        },
      ),
    )
}

test beneficiary_payout_is_encoded_as_fifth_field() {
  let payout_address = Address {
    payment_credential: Script(payment_hash),
    stake_credential: Some(Inline(VerificationKey(stake_hash))),
  }
  let address_data: Data = payout_address
  // Constructor zero, five fields: id 7, empty wallets, None, weight 1, address.
  expect Some(encoded) = cbor.deserialise(
    bytearray.concat(#"d879850780d87a8001", cbor.serialise(address_data)),
  )
  expect decoded: Beneficiary = encoded
  expect
    decoded == Beneficiary {
      ..states.base_beneficiary(),
      id: 7,
      payout_address,
    }
}

test beneficiary_payout_rejects_legacy_four_field_record() fail {
  expect Some(encoded) = cbor.deserialise(#"d879840780d87a8001")
  expect decoded: Beneficiary = encoded
  expect decoded.id == 7
}

test beneficiary_payout_rejects_non_address_data() fail {
  let state = states.base_state()
    |> states.with_beneficiaries(
        [
          Beneficiary {
            ..states.default_beneficiary(7, "beneficiary", Some(100)),
            payout_address: 42,
          },
        ],
      )
    |> states.with_proof_of_life(100, 50)
  expect configuration.expect_valid_state_configuration(state)
}
