//// Tests pinning `lib/streaming_payments/shape.ak` (static-shape validation
//// of the streaming-payment set: what may enter the chain).

use streaming_payments/shape
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
