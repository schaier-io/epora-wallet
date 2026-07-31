//// Tests pinning `lib/streaming_payments/shape.ak` (static-shape validation
//// of the streaming-payment set: what may enter the chain).

use aiken/primitive/bytearray.{from_int_big_endian}
use streaming_payments/shape
use streaming_payments/types.{StreamingPayment}
use test_support/streaming_payment_test_helpers.{
  mk_address, mk_streaming_payment,
}

test streaming_payments_are_valid_accept_distinct_ids() {
  expect
    shape.is_valid(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
        mk_streaming_payment(1, mk_address(#"02"), 0, 2, 20),
      ],
    )
}

test streaming_payments_are_valid_reject_duplicate_ids() fail {
  expect
    shape.is_valid(
      [
        mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
        mk_streaming_payment(0, mk_address(#"02"), 0, 2, 20),
      ],
    )
}

test streaming_payments_reject_malformed_native_policy_id() fail {
  let malformed = StreamingPayment {
    ..mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
    policy_id: from_int_big_endian(1, 27),
    asset_name: #"01",
  }
  expect shape.is_valid([malformed])
}

test streaming_payments_reject_oversized_asset_name() fail {
  let malformed = StreamingPayment {
    ..mk_streaming_payment(0, mk_address(#"01"), 0, 1, 10),
    policy_id: from_int_big_endian(1, 28),
    asset_name: from_int_big_endian(1, 33),
  }
  expect shape.is_valid([malformed])
}

test streaming_payments_accept_zero_duration_schedule() {
  let zero_duration = StreamingPayment {
    ..mk_streaming_payment(0, mk_address(#"01"), 0, 86_400_000_000, 100),
    start_date: 100,
  }
  expect shape.is_valid([zero_duration])
}
