use aiken/fuzz
use cardano/assets
use cardano/transaction.{OutputReference}
use constants
use streaming_payments/types.{StreamingPayment}
use test_support/fuzz_generators
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

fn original_core_fields_match(
  input: StreamingPayment,
  output: StreamingPayment,
) -> Bool {
  and {
    output.payout_address == input.payout_address,
    output.policy_id == input.policy_id,
    output.asset_name == input.asset_name,
    output.amount_per_day == input.amount_per_day,
    output.start_date == input.start_date,
  }
}

test prop_core_equality_matches_every_field(
  inputs via fuzz.both(
    fuzz_generators.streaming_payment(),
    fuzz_generators.streaming_payment(),
  ),
) {
  let (input, output) = inputs
  and {
    types.core_fields_match(input, output) == original_core_fields_match(
      input,
      output,
    ),
    types.core_fields_match(
      input,
      StreamingPayment {
        ..input,
        id: output.id,
        paid_out_amount: output.paid_out_amount,
        end_date: output.end_date,
      },
    ),
    types.core_fields_match(
      input,
      StreamingPayment { ..input, payout_address: output.payout_address },
    ) == ( input.payout_address == output.payout_address ),
    types.core_fields_match(
      input,
      StreamingPayment { ..input, policy_id: output.policy_id },
    ) == ( input.policy_id == output.policy_id ),
    types.core_fields_match(
      input,
      StreamingPayment { ..input, asset_name: output.asset_name },
    ) == ( input.asset_name == output.asset_name ),
    types.core_fields_match(
      input,
      StreamingPayment { ..input, amount_per_day: output.amount_per_day },
    ) == ( input.amount_per_day == output.amount_per_day ),
    types.core_fields_match(
      input,
      StreamingPayment { ..input, start_date: output.start_date },
    ) == ( input.start_date == output.start_date ),
  }
}
