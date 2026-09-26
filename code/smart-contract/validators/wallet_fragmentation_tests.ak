//// Allowance and beneficiary use must not increase the wallet UTxO count.
//// Each pair changes only the partition of the same continuing wallet value.

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Output, Transaction}
use constants
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/wallet_test_helpers as helpers

const wallet_input_lovelace = 8_000_000

const payout_lovelace = 2_000_000

const wallet_return_lovelace = wallet_input_lovelace - payout_lovelace

const tx_earliest = 120

const tx_latest = 130

const beneficiary_id = 7

fn allowance_tx(wallet_outputs: List<Output>) -> Transaction {
  let allowance = assets.from_lovelace(payout_lovelace)
    |> asset_entries.flatten_to_entries
  let user = state_types.User {
    ..states.base_user(),
    id: 1,
    user_wallets: [fixtures.key_hash("user1")],
    per_day_allowance: allowance,
    remaining_allowance: allowance,
    next_allowance_reset: constants.milliseconds_per_day,
  }
  let input_state = states.admin_state()
    |> states.with_users([states.admin_user("admin"), user])
  let output_state = input_state
    |> states.with_users(
        [
          states.admin_user("admin"),
          state_types.User {
            ..user,
            remaining_allowance: [],
            next_allowance_reset: constants.milliseconds_per_day + tx_latest,
          },
        ],
      )
  fixtures.transaction_with_stt_redeemer(
    interval.between(tx_earliest, tx_latest),
    [fixtures.key_hash("user1")],
    [
      helpers.stt_input_with_state(input_state),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(wallet_input_lovelace),
      ),
    ],
    [
      helpers.stt_output_with_state(output_state),
      fixtures.payout_output(
        fixtures.address_from_key("user1"),
        assets.from_lovelace(payout_lovelace),
      ),
      ..wallet_outputs
    ],
    fixtures.tx_id(#"fa01"),
    fixtures.stt_input_ref(),
    state_types.UseAllowance(allowance),
  )
}

fn beneficiary_tx(
  final_beneficiary: Bool,
  wallet_outputs: List<Output>,
) -> Transaction {
  let beneficiary = states.default_beneficiary(
    beneficiary_id,
    "beneficiary1",
    Some(100),
  )
  let other = states.default_beneficiary(8, "beneficiary2", Some(100))
  let beneficiaries = if final_beneficiary {
    [beneficiary]
  } else {
    [beneficiary, other]
  }
  let input_state = states.admin_state()
    |> states.with_beneficiaries(beneficiaries)
  let output_state = if final_beneficiary {
    state_types.State {
      ..input_state,
      last_non_admin_payout_at: Some(tx_latest),
    }
  } else {
    input_state |> states.with_beneficiaries([other])
  }
  fixtures.transaction_with_stt_redeemer(
    interval.between(tx_earliest, tx_latest),
    [fixtures.key_hash("beneficiary1")],
    [
      helpers.stt_input_with_state(input_state),
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(wallet_input_lovelace),
      ),
    ],
    [
      helpers.stt_output_with_state(output_state),
      fixtures.payout_output(
        fixtures.address_from_key("beneficiary-payout"),
        assets.from_lovelace(payout_lovelace),
      ),
      ..wallet_outputs
    ],
    fixtures.tx_id(#"fa02"),
    fixtures.stt_input_ref(),
    state_types.UseBeneficiary(beneficiary_id),
  )
}

test allowance_use_accepts_one_continuing_wallet_output() {
  let transaction = allowance_tx(
    [fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace))],
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseAllowance(
        assets.from_lovelace(payout_lovelace)
          |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
  expect helpers.run_wallet_spend(transaction)
}

test allowance_use_rejects_fragmented_wallet_return() fail {
  let transaction = allowance_tx(
    [
      fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace / 2)),
      fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace / 2)),
    ],
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseAllowance(
        assets.from_lovelace(payout_lovelace)
          |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
  expect helpers.run_wallet_spend(transaction)
}

test final_beneficiary_accepts_one_continuing_wallet_output() {
  let transaction = beneficiary_tx(
    True,
    [fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace))],
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(beneficiary_id),
      fixtures.stt_input_ref(),
      transaction,
    )
  expect helpers.run_wallet_spend(transaction)
}

test final_beneficiary_rejects_fragmented_wallet_return() fail {
  let transaction = beneficiary_tx(
    True,
    [
      fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace / 2)),
      fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace / 2)),
    ],
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(beneficiary_id),
      fixtures.stt_input_ref(),
      transaction,
    )
  expect helpers.run_wallet_spend(transaction)
}

test nonfinal_beneficiary_accepts_one_continuing_wallet_output() {
  let transaction = beneficiary_tx(
    False,
    [fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace))],
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(beneficiary_id),
      fixtures.stt_input_ref(),
      transaction,
    )
  expect helpers.run_wallet_spend(transaction)
}

test nonfinal_beneficiary_rejects_fragmented_wallet_return() fail {
  let transaction = beneficiary_tx(
    False,
    [
      fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace / 2)),
      fixtures.wallet_output(assets.from_lovelace(wallet_return_lovelace / 2)),
    ],
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(beneficiary_id),
      fixtures.stt_input_ref(),
      transaction,
    )
  expect helpers.run_wallet_spend(transaction)
}
