//// Shared builders for the `lib/streaming_payments` test suites
//// (`shape_tests`, `funding_tests`, `forwarding_tests`, `payout_tests`),
//// layered over `test_support/security_fixtures`: a script address, a
//// lovelace streaming payment with the schedule boilerplate zeroed, and the
//// tagged payout output a settlement must emit. Everything here is plain
//// data construction — none of it touches a validator (lib modules must not
//// import a validator).

use cardano/address.{Address, Script}
use cardano/assets
use cardano/transaction.{Output, OutputReference}
use streaming_payments/types.{StreamingPayment}
use test_support/security_fixtures as fixtures

pub fn mk_address(hash: ByteArray) -> Address {
  Address { payment_credential: Script(hash), stake_credential: None }
}

/// A lovelace (empty policy/asset id) streaming payment starting at day 0, so
/// the suites vary only the fields under test.
pub fn mk_streaming_payment(
  id: Int,
  payout_address: Address,
  paid_out_amount: Int,
  amount_per_day: Int,
  end_date: Int,
) -> StreamingPayment {
  fixtures.streaming_payment(
    id,
    payout_address,
    paid_out_amount,
    #"",
    #"",
    amount_per_day,
    0,
    end_date,
  )
}

/// A `quantity`-lovelace payout output tagged with the `OutputId` that binds
/// `streaming_payment_id` to the consumed STT input `expected_ref`.
pub fn mk_output(
  address: Address,
  quantity: Int,
  expected_ref: OutputReference,
  streaming_payment_id: Int,
) -> Output {
  fixtures.tagged_streaming_payment_output(
    address,
    assets.from_lovelace(quantity),
    expected_ref,
    streaming_payment_id,
  )
}
