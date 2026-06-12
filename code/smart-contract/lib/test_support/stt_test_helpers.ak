use aiken/interval
use cardano/assets
use cardano/transaction.{Output, OutputReference, Transaction, ValidityRange}
use state/types as state_types
use test_support/security_fixtures as fixtures

pub fn admin_state() -> state_types.State {
  fixtures.state(
    [fixtures.user(0, ["admin"], [], [], 0, False, None, True)],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
}

pub fn beneficiary_state() -> state_types.State {
  fixtures.state(
    [fixtures.user(0, ["admin"], [], [], 0, False, None, True)],
    None,
    [fixtures.beneficiary(7, ["beneficiary1"], Some(100), 1)],
    Some(100),
    Some(50),
    [],
  )
}

pub fn mint_transaction(
  mint: assets.Value,
  outputs: List<Output>,
  input_ref: OutputReference,
  id: ByteArray,
) -> Transaction {
  let transaction = fixtures.transaction(
    interval.after(0),
    [],
    [fixtures.wallet_input(input_ref, assets.from_lovelace(2_000_000))],
    outputs,
    id,
  )

  Transaction { ..transaction, mint }
}

pub fn spend_transaction(
  validity_range: ValidityRange,
  extra_signatories: List<ByteArray>,
  input_state: state_types.State,
  output_state: state_types.State,
  input_stt_value: assets.Value,
  output_stt_value: assets.Value,
  extra_outputs: List<Output>,
  id: ByteArray,
) -> Transaction {
  spend_transaction_with_mint(
    assets.zero,
    validity_range,
    extra_signatories,
    input_state,
    output_state,
    input_stt_value,
    output_stt_value,
    extra_outputs,
    id,
  )
}

pub fn spend_transaction_with_mint(
  mint: assets.Value,
  validity_range: ValidityRange,
  extra_signatories: List<ByteArray>,
  input_state: state_types.State,
  output_state: state_types.State,
  input_stt_value: assets.Value,
  output_stt_value: assets.Value,
  extra_outputs: List<Output>,
  id: ByteArray,
) -> Transaction {
  let input = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    input_state,
    input_stt_value,
  )
  let output = fixtures.stt_output(
    fixtures.default_policy_id(),
    output_state,
    output_stt_value,
  )

  let transaction = fixtures.transaction(
    validity_range,
    extra_signatories,
    [input],
    [output, ..extra_outputs],
    id,
  )

  Transaction { ..transaction, mint }
}
