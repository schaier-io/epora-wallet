//// Entry-point checks for the Streaming asset existence invariant.
//// Each negative test changes only the source or identity of the asset evidence.
//// These tests run Epora entry points, without ledger checks or other scripts.

use aiken/collection/list
use aiken/interval
use cardano/assets
use cardano/transaction.{Input, Transaction}
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use stt
use stt/io
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/stt_test_helpers

fn payment(id: Int, asset_name: ByteArray) -> StreamingPayment {
  StreamingPayment {
    ..states.base_streaming_payment(),
    id,
    policy_id: fixtures.policy_id("stream"),
    asset_name,
  }
}

fn witness(policy_id: ByteArray, asset_name: ByteArray, quantity: Int) -> Input {
  fixtures.external_input(
    fixtures.output_ref(fixtures.tx_id(asset_name), 0),
    fixtures.address_from_key("unrelated-holder"),
    assets.from_lovelace(2_000_000)
      |> assets.add(policy_id, asset_name, quantity),
  )
}

fn exact_witness() -> Input {
  witness(fixtures.policy_id("stream"), "coin", 1)
}

fn mint_tx(
  payments: List<StreamingPayment>,
  inputs: List<Input>,
  reference_inputs: List<Input>,
) -> Transaction {
  let input_ref = fixtures.stt_input_ref()
  let stt_name = io.output_reference_to_asset_name(input_ref)
  let state = states.admin_state() |> states.with_streaming_payments(payments)
  let tx = stt_test_helpers.mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), stt_name, 1),
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        state,
        fixtures.stt_value(fixtures.default_policy_id(), stt_name, 2_000_000),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"e702"),
  )
  Transaction {
    ..tx,
    inputs: list.concat(tx.inputs, inputs),
    outputs: list.concat(
      tx.outputs,
      list.map(inputs, fn(input) { input.output }),
    ),
    reference_inputs,
  }
}

fn manage_tx(
  previous_payments: List<StreamingPayment>,
  current_payments: List<StreamingPayment>,
  inputs: List<Input>,
  reference_inputs: List<Input>,
) -> Transaction {
  let input_state = states.admin_state()
    |> states.with_streaming_payments(previous_payments)
  let output_state = input_state
    |> states.with_streaming_payments(current_payments)
  let tx = fixtures.stt_spend_tx(
    interval.between(0, 100),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"e703"),
  )
  Transaction {
    ..tx,
    inputs: list.concat(tx.inputs, inputs),
    outputs: list.concat(
      tx.outputs,
      list.map(inputs, fn(input) { input.output }),
    ),
    reference_inputs,
  }
}

fn run_mint(tx: Transaction) -> Bool {
  stt.eval_mint(0, fixtures.default_policy_id(), tx)
}

fn run_manage(tx: Transaction) -> Bool {
  stt.eval_spend(
    None,
    fixtures.operator_action(
      state_types.Admin,
      state_types.ManageStreamingPayments,
    ),
    fixtures.stt_input_ref(),
    tx,
  )
}

test mint_accepts_one_unit_in_consumed_input() {
  run_mint(mint_tx([payment(1, "coin")], [exact_witness()], []))
}

test manage_accepts_one_unit_in_consumed_input() {
  run_manage(manage_tx([], [payment(1, "coin")], [exact_witness()], []))
}

test mint_accepts_reference_input_at_unrelated_address() {
  run_mint(mint_tx([payment(1, "coin")], [], [exact_witness()]))
}

test manage_accepts_reference_input_at_unrelated_address() {
  run_manage(manage_tx([], [payment(1, "coin")], [], [exact_witness()]))
}

test mint_rejects_missing_asset() fail {
  run_mint(mint_tx([payment(1, "coin")], [], []))
}

test manage_rejects_missing_asset() fail {
  run_manage(manage_tx([], [payment(1, "coin")], [], []))
}

test mint_rejects_wrong_policy_in_reference_input() fail {
  run_mint(
    mint_tx(
      [payment(1, "coin")],
      [],
      [witness(fixtures.policy_id("wrong"), "coin", 1)],
    ),
  )
}

test manage_rejects_wrong_policy_in_reference_input() fail {
  run_manage(
    manage_tx(
      [],
      [payment(1, "coin")],
      [],
      [witness(fixtures.policy_id("wrong"), "coin", 1)],
    ),
  )
}

test mint_rejects_wrong_name_in_consumed_input() fail {
  run_mint(
    mint_tx(
      [payment(1, "coin")],
      [witness(fixtures.policy_id("stream"), "wrong", 1)],
      [],
    ),
  )
}

test manage_rejects_wrong_name_in_consumed_input() fail {
  run_manage(
    manage_tx(
      [],
      [payment(1, "coin")],
      [witness(fixtures.policy_id("stream"), "wrong", 1)],
      [],
    ),
  )
}

test mint_rejects_zero_quantity() fail {
  run_mint(
    mint_tx(
      [payment(1, "coin")],
      [],
      [witness(fixtures.policy_id("stream"), "coin", 0)],
    ),
  )
}

test manage_rejects_zero_quantity() fail {
  run_manage(
    manage_tx(
      [],
      [payment(1, "coin")],
      [],
      [witness(fixtures.policy_id("stream"), "coin", 0)],
    ),
  )
}

test mint_rejects_asset_only_in_mint() fail {
  let tx = mint_tx([payment(1, "coin")], [], [])
  run_mint(
    Transaction {
      ..tx,
      mint: assets.add(tx.mint, fixtures.policy_id("stream"), "coin", 1),
    },
  )
}

test manage_rejects_asset_only_in_mint() fail {
  let tx = manage_tx([], [payment(1, "coin")], [], [])
  run_manage(
    Transaction {
      ..tx,
      mint: assets.from_asset(fixtures.policy_id("stream"), "coin", 1),
    },
  )
}

test mint_rejects_asset_only_in_output() fail {
  let tx = mint_tx([payment(1, "coin")], [], [])
  run_mint(
    Transaction { ..tx, outputs: [exact_witness().output, ..tx.outputs] },
  )
}

test manage_rejects_asset_only_in_output() fail {
  let tx = manage_tx([], [payment(1, "coin")], [], [])
  run_manage(
    Transaction { ..tx, outputs: [exact_witness().output, ..tx.outputs] },
  )
}

test mint_accepts_distinct_assets_across_both_input_kinds() {
  run_mint(
    mint_tx(
      [payment(1, "coin"), payment(2, "second")],
      [exact_witness()],
      [witness(fixtures.policy_id("stream"), "second", 1)],
    ),
  )
}

test manage_accepts_distinct_assets_across_both_input_kinds() {
  run_manage(
    manage_tx(
      [],
      [payment(1, "coin"), payment(2, "second")],
      [exact_witness()],
      [witness(fixtures.policy_id("stream"), "second", 1)],
    ),
  )
}

test mint_rejects_one_missing_asset_among_distinct_assets() fail {
  run_mint(
    mint_tx([payment(1, "coin"), payment(2, "second")], [exact_witness()], []),
  )
}

test manage_rejects_one_missing_asset_among_distinct_assets() fail {
  run_manage(
    manage_tx(
      [],
      [payment(1, "coin"), payment(2, "second")],
      [exact_witness()],
      [],
    ),
  )
}

test mint_accepts_one_unit_for_multiple_streams_of_same_asset() {
  run_mint(
    mint_tx([payment(1, "coin"), payment(2, "coin")], [], [exact_witness()]),
  )
}

test manage_accepts_one_unit_for_multiple_streams_of_same_asset() {
  run_manage(
    manage_tx(
      [],
      [payment(1, "coin"), payment(2, "coin")],
      [],
      [exact_witness()],
    ),
  )
}

test mint_accepts_native_asset_with_empty_name() {
  run_mint(
    mint_tx(
      [payment(1, #"")],
      [],
      [witness(fixtures.policy_id("stream"), #"", 1)],
    ),
  )
}

test manage_accepts_forwarded_stream_without_asset_evidence() {
  let previous = [payment(1, "coin")]
  run_manage(manage_tx(previous, previous, [], []))
}

test manage_accepts_rescheduled_stream_without_asset_evidence() {
  let previous = payment(1, "coin")
  let rescheduled = StreamingPayment { ..previous, end_date: 200 }
  run_manage(manage_tx([previous], [rescheduled], [], []))
}

test manage_rejects_new_id_for_existing_asset_without_evidence() fail {
  let previous = payment(1, "coin")
  run_manage(manage_tx([previous], [previous, payment(2, "coin")], [], []))
}

test mint_accepts_ada_from_normal_fee_input() {
  run_mint(mint_tx([states.base_streaming_payment()], [], []))
}

test manage_accepts_ada_from_consumed_stt_input() {
  run_manage(manage_tx([], [states.base_streaming_payment()], [], []))
}
