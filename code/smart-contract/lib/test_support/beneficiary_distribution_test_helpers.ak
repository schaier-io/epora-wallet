//// Shared exact-distribution transaction fixtures.

use aiken/collection/list
use aiken/interval
use cardano/address.{Address}
use cardano/assets
use cardano/transaction.{Output, Transaction}
use state/types as state_types
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

pub fn input_state(final: Bool) -> state_types.State {
  states.base_state()
    |> states.with_proof_of_life(100, 50)
    |> states.with_beneficiaries(
        [
          state_types.Beneficiary {
            ..states.default_beneficiary(7, "beneficiary", Some(100)),
            weight: 1,
          },
          ..if final {
            []
          } else {
            [
              state_types.Beneficiary {
                ..states.default_beneficiary(8, "remaining", Some(110)),
                weight: 3,
              },
            ]
          }
        ],
      )
}

pub fn input_value() -> assets.Value {
  assets.from_lovelace(8_000_000)
    |> assets.add(fixtures.policy_id("token"), "asset", 8)
}

pub fn payout_outputs(
  state: state_types.State,
  value: assets.Value,
) -> List<Output> {
  let weight = list.foldl(
    state.access.beneficiaries,
    0,
    fn(b, sum) { sum + b.weight },
  )
  list.map(
    state.access.beneficiaries,
    fn(beneficiary) {
      expect address: Address = beneficiary.payout_address
      let share = list.foldl(
        assets.flatten(value),
        assets.zero,
        fn(asset, acc) {
          let (policy, name, quantity) = asset
          assets.add(acc, policy, name, quantity * beneficiary.weight / weight)
        },
      )
      fixtures.tagged_streaming_payment_output(
        address,
        share,
        fixtures.stt_input_ref(),
        beneficiary.id,
      )
    },
  )
}

pub fn distribution_tx(
  input: state_types.State,
  output: state_types.State,
  value: assets.Value,
  payouts: List<Output>,
) -> Transaction {
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
      fixtures.wallet_input(fixtures.wallet_input_ref(), value),
    ],
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        output,
        fixtures.default_stt_value(),
      ),
      ..payouts
    ],
    fixtures.tx_id(#"ed01"),
    fixtures.stt_input_ref(),
    state_types.DistributeBeneficiaries(7),
  )
}

pub fn valid_tx(final: Bool) -> Transaction {
  let input = input_state(final)
  let output = state_types.State {
    ..input,
    last_non_admin_payout_at: if final {
      Some(130)
    } else {
      None
    },
  }
  distribution_tx(
    input,
    output,
    input_value(),
    payout_outputs(input, input_value()),
  )
}
