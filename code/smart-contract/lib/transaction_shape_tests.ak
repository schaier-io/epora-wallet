//// Tests for transaction collections that validator logic scans.

use aiken/collection/list
use cardano/assets
use cardano/transaction.{Spend, Transaction, placeholder}
use constants
use state/types as state_types
use test_support/security_fixtures as fixtures
use transaction_shape

fn transaction_with_lengths(
  input_count: Int,
  output_count: Int,
  signatory_count: Int,
  redeemer_count: Int,
) -> Transaction {
  let input_reference = fixtures.output_ref(fixtures.tx_id(#"71"), 0)
  let input = fixtures.external_input(
    input_reference,
    fixtures.address_from_key("funding"),
    assets.from_lovelace(2_000_000),
  )
  let output = fixtures.wallet_output(assets.from_lovelace(2_000_000))
  let redeemer_data: Data = state_types.Consolidate(state_types.AdminPath)
  Transaction {
    ..placeholder,
    inputs: list.repeat(input, input_count),
    outputs: list.repeat(output, output_count),
    extra_signatories: list.repeat(fixtures.key_hash("signer"), signatory_count),
    redeemers: list.repeat(
      Pair(Spend(input_reference), redeemer_data),
      redeemer_count,
    ),
  }
}

test transaction_shape_accepts_all_limits_exactly() {
  transaction_shape.is_bounded(
    transaction_with_lengths(
      constants.max_transaction_inputs,
      constants.max_transaction_outputs,
      constants.max_transaction_signatories,
      constants.max_transaction_redeemers,
    ),
  )
}

test transaction_shape_rejects_too_many_inputs() fail {
  transaction_shape.is_bounded(
    transaction_with_lengths(constants.max_transaction_inputs + 1, 0, 0, 0),
  )
}

test transaction_shape_rejects_too_many_outputs() fail {
  transaction_shape.is_bounded(
    transaction_with_lengths(0, constants.max_transaction_outputs + 1, 0, 0),
  )
}

test transaction_shape_rejects_too_many_signatories() fail {
  transaction_shape.is_bounded(
    transaction_with_lengths(0, 0, constants.max_transaction_signatories + 1, 0),
  )
}

test transaction_shape_rejects_too_many_redeemers() fail {
  transaction_shape.is_bounded(
    transaction_with_lengths(0, 0, 0, constants.max_transaction_redeemers + 1),
  )
}

test governance_shape_accepts_stt_plus_one_wallet_purpose() {
  transaction_shape.governance_is_bounded(
    transaction_with_lengths(
      0,
      0,
      0,
      constants.max_governance_transaction_redeemers,
    ),
  )
}

test governance_shape_rejects_a_third_script_purpose() fail {
  transaction_shape.governance_is_bounded(
    transaction_with_lengths(
      0,
      0,
      0,
      constants.max_governance_transaction_redeemers + 1,
    ),
  )
}
