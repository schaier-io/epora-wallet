//// Focused payout-routing tests. These drive the public anti-leak predicate
//// directly, so their execution units isolate routing from STT transition and
//// wallet reserve costs.

use aiken/collection/list
use aiken/primitive/bytearray
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Output, OutputReference}
use constants
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use wallet/payout_routing.{OutputContext}

const payment_ids: List<Int> = list.range(1, constants.max_streaming_payments)

const payout_policy_id: ByteArray = fixtures.policy_id(#"70")

const shared_asset_name: ByteArray = #"53"

type RoutingFixture {
  output_context: OutputContext,
  streaming_payments: List<StreamingPayment>,
  payout_delta: state_types.AssetEntries,
}

fn distinct_asset_name(payment_id: Int) -> ByteArray {
  bytearray.from_int_big_endian(payment_id, 1)
}

fn streaming_payment(payment_id: Int, asset_name: ByteArray) -> StreamingPayment {
  StreamingPayment {
    ..states.base_streaming_payment(),
    id: payment_id,
    payout_address: fixtures.address_from_key(#"71"),
    policy_id: payout_policy_id,
    asset_name,
  }
}

fn tagged_output_for_reference(
  payment_id: Int,
  asset_name: ByteArray,
  stt_input_reference: OutputReference,
) -> Output {
  fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key(#"71"),
    assets.merge(
      assets.from_lovelace(1_500_000),
      assets.from_asset(payout_policy_id, asset_name, 1),
    ),
    stt_input_reference,
    payment_id,
  )
}

fn tagged_output(payment_id: Int, asset_name: ByteArray) -> Output {
  tagged_output_for_reference(payment_id, asset_name, fixtures.stt_input_ref())
}

fn output_context(outputs: List<Output>) -> OutputContext {
  OutputContext {
    wallet_address: fixtures.wallet_script_address(),
    stt_input_reference: fixtures.stt_input_ref(),
    stt_address: fixtures.stt_address(fixtures.default_policy_id()),
    outputs,
  }
}

fn distinct_routing_fixture(stream_count: Int) -> RoutingFixture {
  let ids = list.range(1, stream_count)
  let payout_ids = list.drop(
    ids,
    stream_count - constants.max_streaming_payouts_per_transaction,
  )
  let streaming_payments = list.map(
    ids,
    fn(payment_id) {
      streaming_payment(payment_id, distinct_asset_name(payment_id))
    },
  )
  let outputs = list.map(
    payout_ids,
    fn(payment_id) {
      tagged_output(payment_id, distinct_asset_name(payment_id))
    },
  )
  let payout_delta = list.foldl(
    payout_ids,
    assets.zero,
    fn(payment_id, acc) {
      assets.merge(
        acc,
        assets.from_asset(payout_policy_id, distinct_asset_name(payment_id), 1),
      )
    },
  )
    |> asset_entries.flatten_to_entries
  RoutingFixture {
    output_context: output_context(outputs),
    streaming_payments,
    payout_delta,
  }
}

const distinct_05_fixture: RoutingFixture = distinct_routing_fixture(5)

const distinct_10_fixture: RoutingFixture = distinct_routing_fixture(10)

const distinct_15_fixture: RoutingFixture = distinct_routing_fixture(15)

const distinct_20_fixture: RoutingFixture = distinct_routing_fixture(20)

const distinct_22_fixture: RoutingFixture = distinct_routing_fixture(22)

const distinct_24_fixture: RoutingFixture = distinct_routing_fixture(24)

const max_distinct_fixture: RoutingFixture =
  distinct_routing_fixture(constants.max_streaming_payments)

const max_shared_streaming_payments: List<StreamingPayment> =
  list.map(
    payment_ids,
    fn(payment_id) { streaming_payment(payment_id, shared_asset_name) },
  )

const max_shared_outputs: List<Output> =
  list.map(
    list.drop(
      payment_ids,
      constants.max_streaming_payments - constants.max_streaming_payouts_per_transaction,
    ),
    fn(payment_id) { tagged_output(payment_id, shared_asset_name) },
  )

const max_shared_payout_delta: state_types.AssetEntries =
  assets.from_asset(
    payout_policy_id,
    shared_asset_name,
    constants.max_streaming_payouts_per_transaction,
  )
    |> asset_entries.flatten_to_entries

const max_shared_output_context: OutputContext =
  output_context(max_shared_outputs)

test payout_routing_accepts_max_distinct_asset_streams() {
  payout_routing.assets_only_reach_matching_outputs(
    max_distinct_fixture.output_context,
    max_distinct_fixture.streaming_payments,
    max_distinct_fixture.payout_delta,
  )
}

test payout_routing_cost_distinct_05() {
  payout_routing.assets_only_reach_matching_outputs(
    distinct_05_fixture.output_context,
    distinct_05_fixture.streaming_payments,
    distinct_05_fixture.payout_delta,
  )
}

test payout_routing_cost_distinct_10() {
  payout_routing.assets_only_reach_matching_outputs(
    distinct_10_fixture.output_context,
    distinct_10_fixture.streaming_payments,
    distinct_10_fixture.payout_delta,
  )
}

test payout_routing_cost_distinct_15() {
  payout_routing.assets_only_reach_matching_outputs(
    distinct_15_fixture.output_context,
    distinct_15_fixture.streaming_payments,
    distinct_15_fixture.payout_delta,
  )
}

test payout_routing_cost_distinct_20() {
  payout_routing.assets_only_reach_matching_outputs(
    distinct_20_fixture.output_context,
    distinct_20_fixture.streaming_payments,
    distinct_20_fixture.payout_delta,
  )
}

test payout_routing_cost_distinct_22() {
  payout_routing.assets_only_reach_matching_outputs(
    distinct_22_fixture.output_context,
    distinct_22_fixture.streaming_payments,
    distinct_22_fixture.payout_delta,
  )
}

test payout_routing_cost_distinct_24() {
  payout_routing.assets_only_reach_matching_outputs(
    distinct_24_fixture.output_context,
    distinct_24_fixture.streaming_payments,
    distinct_24_fixture.payout_delta,
  )
}

test payout_routing_accepts_max_shared_asset_streams() {
  payout_routing.assets_only_reach_matching_outputs(
    max_shared_output_context,
    max_shared_streaming_payments,
    max_shared_payout_delta,
  )
}

test payout_routing_accepts_mixed_ada_and_token_payouts() {
  let token_asset_name = #"01"
  let token_stream = streaming_payment(1, token_asset_name)
  let ada_stream = StreamingPayment {
    ..streaming_payment(2, #""),
    policy_id: assets.ada_policy_id,
  }
  let outputs = [
    tagged_output(1, token_asset_name),
    fixtures.tagged_streaming_payment_output(
      ada_stream.payout_address,
      assets.from_lovelace(1_500_000),
      fixtures.stt_input_ref(),
      2,
    ),
  ]
  let payout_delta = assets.merge(
    assets.from_lovelace(1),
    assets.from_asset(payout_policy_id, token_asset_name, 1),
  )
    |> asset_entries.flatten_to_entries

  payout_routing.assets_only_reach_matching_outputs(
    output_context(outputs),
    [token_stream, ada_stream],
    payout_delta,
  )
}

test payout_routing_rejects_asset_under_other_stream_tag() fail {
  let first_asset_name = #"01"
  let second_asset_name = #"02"
  let streaming_payments = [
    streaming_payment(1, first_asset_name),
    streaming_payment(2, second_asset_name),
  ]
  let outputs = [
    tagged_output(1, second_asset_name),
    tagged_output(2, first_asset_name),
  ]
  let payout_delta = assets.merge(
    assets.from_asset(payout_policy_id, first_asset_name, 1),
    assets.from_asset(payout_policy_id, second_asset_name, 1),
  )
    |> asset_entries.flatten_to_entries

  expect
    payout_routing.assets_only_reach_matching_outputs(
      output_context(outputs),
      streaming_payments,
      payout_delta,
    )
  True
}

test payout_routing_rejects_tag_from_other_stt_input() fail {
  let asset_name = #"01"
  let other_stt_input_reference = fixtures.output_ref(fixtures.tx_id(#"72"), 1)
  let payout_delta = assets.from_asset(payout_policy_id, asset_name, 1)
    |> asset_entries.flatten_to_entries

  expect
    payout_routing.assets_only_reach_matching_outputs(
      output_context(
        [tagged_output_for_reference(1, asset_name, other_stt_input_reference)],
      ),
      [streaming_payment(1, asset_name)],
      payout_delta,
    )
  True
}

test payout_routing_rejects_delta_above_transaction_cap() fail {
  let over_cap_ids = list.range(
    1,
    constants.max_streaming_payouts_per_transaction + 1,
  )
  let over_cap_delta = list.foldl(
    over_cap_ids,
    assets.zero,
    fn(payment_id, acc) {
      assets.merge(
        acc,
        assets.from_asset(payout_policy_id, distinct_asset_name(payment_id), 1),
      )
    },
  )
    |> asset_entries.flatten_to_entries

  expect
    payout_routing.assets_only_reach_matching_outputs(
      max_distinct_fixture.output_context,
      max_distinct_fixture.streaming_payments,
      over_cap_delta,
    )
  True
}
