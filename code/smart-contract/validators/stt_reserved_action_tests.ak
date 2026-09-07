//// Retired constructor 7 cannot authorize STT transitions or wallet movement.

use aiken/cbor
use aiken/interval
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use wallet/spend as wallet

fn reserved_action() -> state_types.SttAction {
  expect Some(data) = cbor.deserialise(#"d905008107")
  expect action: state_types.SttAction = data
  action
}

fn withdrawal_tx(action: state_types.SttAction) -> Transaction {
  let remaining = states.default_beneficiary(8, "remaining", Some(200))
  let input = states.secured_state(
    [],
    [states.default_beneficiary(7, "beneficiary", Some(100)), remaining],
    [],
  )
  let output = state_types.State {
    ..input,
    access: state_types.AccessControl {
      ..input.access,
      beneficiaries: [remaining],
    },
  }
  fixtures.transaction_with_stt_redeemer(
    interval.between(120, 130),
    [fixtures.key_hash("beneficiary")],
    [
      fixtures.stt_input(
        fixtures.stt_input_ref(),
        fixtures.default_policy_id(),
        input,
        fixtures.default_stt_value(),
      ),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(10_000_000),
      ),
    ],
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        output,
        fixtures.default_stt_value(),
      ),
      fixtures.payout_output(
        fixtures.address_from_key("beneficiary"),
        assets.from_lovelace(5_000_000),
      ),
      fixtures.wallet_output(assets.from_lovelace(5_000_000)),
    ],
    fixtures.tx_id(#"eb01"),
    fixtures.stt_input_ref(),
    action,
  )
}

fn run_wallet(tx: Transaction) -> Bool {
  wallet.eval_spend(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    None,
    0,
    fixtures.wallet_input_ref(),
    tx,
  )
}

test reserved_constructor_preserves_action_encoding() {
  let reserved: Data = reserved_action()
  let beneficiary_use: Data = state_types.UseBeneficiary(7)
  let cancel: Data = state_types.CancelStreamingPayment(7)
  let stop: Data = state_types.StopBeneficiaryStream(7, 1)
  let distribute: Data = state_types.DistributeBeneficiaries(7)
  expect cbor.deserialise(#"d905008107") == Some(reserved)
  expect cbor.deserialise(#"d87c8107") == Some(beneficiary_use)
  expect cbor.deserialise(#"d87f8107") == Some(cancel)
  expect cbor.deserialise(#"d90501820701") == Some(stop)
  expect cbor.deserialise(#"d905028107") == Some(distribute)
}

test reserved_constructor_rejects_stt_transition() fail {
  let action = reserved_action()
  expect
    stt.eval_spend(
      None,
      action,
      fixtures.stt_input_ref(),
      withdrawal_tx(action),
    )
}

test reserved_constructor_rejects_wallet_spend() fail {
  expect run_wallet(withdrawal_tx(reserved_action()))
}

test beneficiary_use_still_accepts_weighted_withdrawal() {
  let action = state_types.UseBeneficiary(7)
  let tx = withdrawal_tx(action)
  expect stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
  expect run_wallet(tx)
}
