use cardano/assets
use cardano/transaction.{OutputReference}
use constants
use streaming_payments/types
use test_support/security_fixtures as fixtures

fn tagged_output(payment_id: Int, output_index: Int) {
  let input_reference = fixtures.stt_input_ref()
  fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key(#"01"),
    assets.from_lovelace(1_500_000),
    OutputReference { ..input_reference, output_index },
    payment_id,
  )
}

test payout_tag_accepts_uint64_edges() {
  and {
    types.output_payout_tag(tagged_output(0, 0)) != None,
    types.output_payout_tag(
      tagged_output(constants.max_state_integer, constants.max_state_integer),
    ) != None,
  }
}

test payout_tag_rejects_negative_id() {
  types.output_payout_tag(tagged_output(-1, 0)) == None
}

test payout_tag_rejects_id_above_uint64() {
  types.output_payout_tag(tagged_output(constants.max_state_integer + 1, 0)) == None
}

test payout_tag_rejects_negative_output_index() {
  types.output_payout_tag(tagged_output(0, -1)) == None
}

test payout_tag_rejects_output_index_above_uint64() {
  types.output_payout_tag(tagged_output(0, constants.max_state_integer + 1)) == None
}
