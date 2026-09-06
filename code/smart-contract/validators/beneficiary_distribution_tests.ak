//// Exact distribution preserves rights and routes divisible shares once.

use aiken/cbor
use aiken/collection/list
use aiken/interval
use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{InlineDatum, Input, NoDatum, Output, Transaction}
use state/types as state_types
use streaming_payments/types.{expected_payout_tag} as streaming_payment_types
use stt
use test_support/beneficiary_distribution_test_helpers as exact
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use wallet

fn run_stt(tx: Transaction) -> Bool {
  stt.eval_spend(
    None,
    state_types.DistributeBeneficiaries(7),
    fixtures.stt_input_ref(),
    tx,
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

fn with_output_state(
  input: state_types.State,
  output: state_types.State,
) -> Transaction {
  exact.distribution_tx(
    input,
    output,
    exact.input_value(),
    exact.payout_outputs(input, exact.input_value()),
  )
}

fn change_first_payout(
  tx: Transaction,
  change: fn(Output) -> Output,
) -> Transaction {
  expect [stt_output, first, ..rest] = tx.outputs
  Transaction { ..tx, outputs: [stt_output, change(first), ..rest] }
}

test distribute_constructor_is_appended_at_nine() {
  let action: Data = state_types.DistributeBeneficiaries(7)
  cbor.deserialise(#"d905028107") == Some(action)
}

test exact_weighted_distribution_keeps_beneficiaries() {
  let tx = exact.valid_tx(False)
  expect run_stt(tx)
  run_wallet(tx)
}

test final_exact_distribution_keeps_final_and_advances_cadence() {
  let tx = exact.valid_tx(True)
  expect run_stt(tx)
  run_wallet(tx)
}

test other_beneficiary_signatures_are_allowed() {
  let tx = exact.valid_tx(False)
  run_stt(
    Transaction {
      ..tx,
      extra_signatories: [
        fixtures.key_hash("beneficiary"),
        fixtures.key_hash("remaining"),
      ],
    },
  )
}

test missing_initiator_signature_is_rejected() fail {
  let tx = exact.valid_tx(False)
  run_stt(
    Transaction { ..tx, extra_signatories: [fixtures.key_hash("remaining")] },
  )
}

test wrong_declared_initiator_is_rejected() fail {
  stt.eval_spend(
    None,
    state_types.DistributeBeneficiaries(99),
    fixtures.stt_input_ref(),
    exact.valid_tx(False),
  )
}

test another_locked_beneficiary_blocks_distribution() fail {
  let input = exact.input_state(False)
  expect [first, second] = input.access.beneficiaries
  let locked = states.with_beneficiaries(
    input,
    [first, state_types.Beneficiary { ..second, unlock_after: Some(121) }],
  )
  run_stt(with_output_state(locked, locked))
}

test global_unlock_is_required() fail {
  let input = exact.input_state(False) |> states.with_proof_of_life(121, 50)
  run_stt(with_output_state(input, input))
}

test streams_must_be_empty_even_if_fully_settled() fail {
  let input = exact.input_state(False)
    |> states.with_streaming_payments(
        [
          streaming_payment_types.StreamingPayment {
            ..states.base_streaming_payment(),
            start_date: 0,
            end_date: 0,
          },
        ],
      )
  run_stt(with_output_state(input, input))
}

test multiple_beneficiaries_cannot_advance_cadence() fail {
  let input = exact.input_state(False)
  run_stt(
    with_output_state(
      input,
      state_types.State { ..input, last_non_admin_payout_at: Some(130) },
    ),
  )
}

test final_distribution_requires_cadence_stamp() fail {
  let input = exact.input_state(True)
  run_stt(with_output_state(input, input))
}

test final_distribution_cannot_bypass_cooldown() fail {
  let input = state_types.State {
    ..exact.input_state(True),
    last_non_admin_payout_at: Some(119),
  }
  run_stt(
    with_output_state(
      input,
      state_types.State { ..input, last_non_admin_payout_at: Some(130) },
    ),
  )
}

test final_distribution_requires_finite_upper_bound() fail {
  let tx = exact.valid_tx(True)
  run_stt(Transaction { ..tx, validity_range: interval.after(120) })
}

test beneficiary_removal_is_rejected() fail {
  let input = exact.input_state(False)
  run_stt(with_output_state(input, states.with_beneficiaries(input, [])))
}

test payout_address_mutation_is_rejected() fail {
  let input = exact.input_state(False)
  expect [first, second] = input.access.beneficiaries
  let output = states.with_beneficiaries(
    input,
    [
      state_types.Beneficiary {
        ..first,
        payout_address: fixtures.address_from_key("changed"),
      },
      second,
    ],
  )
  run_stt(with_output_state(input, output))
}

test indivisible_native_quantity_is_rejected() fail {
  let input = exact.input_state(False)
  let value = assets.add(
    exact.input_value(),
    fixtures.policy_id("token"),
    "asset",
    1,
  )
  run_wallet(
    exact.distribution_tx(
      input,
      input,
      value,
      exact.payout_outputs(input, value),
    ),
  )
}

test indivisible_lovelace_is_rejected() fail {
  let input = exact.input_state(False)
  let value = assets.add(exact.input_value(), "", "", 1)
  run_wallet(
    exact.distribution_tx(
      input,
      input,
      value,
      exact.payout_outputs(input, value),
    ),
  )
}

test external_ada_topup_is_allowed() {
  let tx = change_first_payout(
    exact.valid_tx(False),
    fn(output) {
      Output { ..output, value: assets.add(output.value, "", "", 1_000_000) }
    },
  )
  run_wallet(
    Transaction {
      ..tx,
      inputs: [
        fixtures.external_input(
          fixtures.secondary_wallet_input_ref(),
          fixtures.address_from_key("funder"),
          assets.from_lovelace(1_000_000),
        ),
        ..tx.inputs
      ],
    },
  )
}

test native_topup_is_rejected() fail {
  run_wallet(
    change_first_payout(
      exact.valid_tx(False),
      fn(output) {
        Output {
          ..output,
          value: assets.add(
            output.value,
            fixtures.policy_id("token"),
            "asset",
            1,
          ),
        }
      },
    ),
  )
}

test lovelace_underpayment_is_rejected() fail {
  run_wallet(
    change_first_payout(
      exact.valid_tx(False),
      fn(output) {
        Output { ..output, value: assets.add(output.value, "", "", -1) }
      },
    ),
  )
}

test full_payout_address_is_required() fail {
  run_wallet(
    change_first_payout(
      exact.valid_tx(False),
      fn(output) {
        Output {
          ..output,
          address: Address {
            ..output.address,
            stake_credential: Some(
              Inline(VerificationKey(fixtures.key_hash("stake"))),
            ),
          },
        }
      },
    ),
  )
}

test script_address_with_stake_receives_exact_share() {
  let input = exact.input_state(False)
  expect [first, second] = input.access.beneficiaries
  let address = Address {
    payment_credential: Script(fixtures.key_hash("payee")),
    stake_credential: Some(Inline(Script(fixtures.key_hash("stake")))),
  }
  let state = states.with_beneficiaries(
    input,
    [state_types.Beneficiary { ..first, payout_address: address }, second],
  )
  let tx = with_output_state(state, state)
  expect run_stt(tx)
  run_wallet(tx)
}

test missing_tag_is_rejected() fail {
  run_wallet(
    change_first_payout(
      exact.valid_tx(False),
      fn(output) { Output { ..output, datum: NoDatum } },
    ),
  )
}

test stale_stt_tag_is_rejected() fail {
  run_wallet(
    change_first_payout(
      exact.valid_tx(False),
      fn(output) {
        Output {
          ..output,
          datum: InlineDatum(
            expected_payout_tag(7, fixtures.secondary_stt_input_ref()),
          ),
        }
      },
    ),
  )
}

test duplicate_tag_cannot_satisfy_two_beneficiaries() fail {
  let tx = exact.valid_tx(False)
  expect [stt_output, first, second] = tx.outputs
  run_wallet(
    Transaction {
      ..tx,
      outputs: [stt_output, first, Output { ..second, datum: first.datum }],
    },
  )
}

test duplicate_output_for_one_tag_is_rejected() fail {
  let tx = exact.valid_tx(False)
  expect [_, first, ..] = tx.outputs
  run_wallet(Transaction { ..tx, outputs: [first, ..tx.outputs] })
}

test continuing_wallet_output_is_rejected() fail {
  let tx = exact.valid_tx(False)
  run_wallet(
    Transaction {
      ..tx,
      outputs: [
        fixtures.wallet_output(assets.from_lovelace(1_000_000)),
        ..tx.outputs
      ],
    },
  )
}

test second_wallet_input_is_rejected() fail {
  let tx = exact.valid_tx(False)
  run_wallet(
    Transaction {
      ..tx,
      inputs: [
        fixtures.wallet_input(
          fixtures.secondary_wallet_input_ref(),
          exact.input_value(),
        ),
        ..tx.inputs
      ],
    },
  )
}

test wallet_stake_variant_still_counts_as_second_input() fail {
  let tx = exact.valid_tx(False)
  let other = fixtures.wallet_input(
    fixtures.secondary_wallet_input_ref(),
    exact.input_value(),
  )
  run_wallet(
    Transaction {
      ..tx,
      inputs: [
        Input {
          ..other,
          output: Output {
            ..other.output,
            address: Address {
              ..other.output.address,
              stake_credential: Some(
                Inline(VerificationKey(fixtures.key_hash("stake"))),
              ),
            },
          },
        },
        ..tx.inputs
      ],
    },
  )
}

test wallet_self_destination_is_rejected() fail {
  let input = exact.input_state(False)
  expect [first, second] = input.access.beneficiaries
  let state = states.with_beneficiaries(
    input,
    [
      state_types.Beneficiary {
        ..first,
        payout_address: fixtures.wallet_script_address(),
      },
      second,
    ],
  )
  run_wallet(with_output_state(state, state))
}

test stt_self_destination_is_rejected() fail {
  let input = exact.input_state(False)
  expect [first, second] = input.access.beneficiaries
  let state = states.with_beneficiaries(
    input,
    [
      state_types.Beneficiary {
        ..first,
        payout_address: fixtures.stt_address(fixtures.default_policy_id()),
      },
      second,
    ],
  )
  run_wallet(with_output_state(state, state))
}

test authorized_stt_only_transaction_preserves_multiple_beneficiary_state() {
  let tx = exact.valid_tx(False)
  run_stt(
    Transaction {
      ..tx,
      inputs: list.take(tx.inputs, 1),
      outputs: list.take(tx.outputs, 1),
    },
  )
}

test duplicate_tag_outputs_fail_even_when_their_sum_is_exact() fail {
  let tx = exact.valid_tx(False)
  expect [stt_output, first, second] = tx.outputs
  let half = assets.from_lovelace(1_000_000)
    |> assets.add(fixtures.policy_id("token"), "asset", 1)
  let split = Output { ..first, value: half }
  run_wallet(Transaction { ..tx, outputs: [stt_output, split, split, second] })
}

test ada_topups_cannot_make_indivisible_input_divisible() fail {
  let input = exact.input_state(False)
  let value = assets.add(exact.input_value(), "", "", 1)
  let payouts = list.map(
    exact.payout_outputs(input, value),
    fn(output) {
      Output { ..output, value: assets.add(output.value, "", "", 1_000_000) }
    },
  )
  run_wallet(exact.distribution_tx(input, input, value, payouts))
}

test stt_payment_credential_is_rejected_across_stake_variants() fail {
  let input = exact.input_state(False)
  expect [first, second] = input.access.beneficiaries
  let address = Address {
    ..fixtures.stt_address(fixtures.default_policy_id()),
    stake_credential: Some(Inline(VerificationKey(fixtures.key_hash("stake")))),
  }
  let state = states.with_beneficiaries(
    input,
    [state_types.Beneficiary { ..first, payout_address: address }, second],
  )
  run_wallet(with_output_state(state, state))
}

test wallet_payment_credential_is_rejected_across_stake_variants() fail {
  let input = exact.input_state(False)
  expect [first, second] = input.access.beneficiaries
  let address = Address {
    ..fixtures.wallet_script_address(),
    stake_credential: Some(Inline(VerificationKey(fixtures.key_hash("stake")))),
  }
  let state = states.with_beneficiaries(
    input,
    [state_types.Beneficiary { ..first, payout_address: address }, second],
  )
  run_wallet(with_output_state(state, state))
}

test authorized_stt_only_final_distribution_advances_cadence() {
  let tx = exact.valid_tx(True)
  run_stt(
    Transaction {
      ..tx,
      inputs: list.take(tx.inputs, 1),
      outputs: list.take(tx.outputs, 1),
    },
  )
}

const dense_divisible_transaction: Transaction = {
    let input = exact.input_state(False)
    let value = list.foldl(
      list.range(1, 30),
      exact.input_value(),
      fn(id, value) {
        assets.add(value, fixtures.policy_id("dense"), cbor.serialise(id), 4)
      },
    )
    let tx = exact.distribution_tx(
      input,
      input,
      value,
      exact.payout_outputs(input, value),
    )
    tx
  }

test dense_divisible_input_has_no_asset_count_cap_stt() {
  run_stt(dense_divisible_transaction)
}

test dense_divisible_input_has_no_asset_count_cap_wallet() {
  run_wallet(dense_divisible_transaction)
}
