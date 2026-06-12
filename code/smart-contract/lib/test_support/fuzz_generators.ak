//// Reusable domain Fuzzers for the VALIDATOR-LEVEL property tests
//// (`validators/wallet_fuzz_tests.ak`, `validators/stt_fuzz_tests.ak`). These
//// build randomized pieces of an otherwise well-formed transition — attacker
//// keys, signatory sets, streaming-payment lists — so the validator's response
//// can be asserted across the whole input space rather than at hand-picked
//// fixtures. None of these import a validator (lib modules must not); they only
//// produce data. Shared scaffolding lives here so it is defined once rather
//// than copy-pasted per test file.

use aiken/fuzz
use cardano/fuzz as cardano_fuzz
use streaming_payments/types.{StreamingPayment}

/// A key hash guaranteed distinct from `reserved`. Used to fuzz an attacker /
/// non-payee key over the byte-string space while excluding the one configured
/// key whose presence would make the action legitimate.
pub fn key_hash_other_than(reserved: ByteArray) -> Fuzzer<ByteArray> {
  fuzz.bytearray() |> fuzz.such_that(fn(key) { key != reserved })
}

/// A list of transaction signatories, none of which is `reserved` (e.g. the
/// admin key). An authority check that can only be satisfied by `reserved` must
/// therefore reject for EVERY value this produces — including the empty list.
pub fn signatories_excluding(reserved: ByteArray) -> Fuzzer<List<ByteArray>> {
  fuzz.list(key_hash_other_than(reserved))
}

/// An arbitrary `StreamingPayment`. Field values are deliberately unconstrained
/// (ids/amounts/dates may be nonsensical): the invariants that consume this —
/// e.g. the permissionless-crank no-op guard — fire BEFORE any well-formedness
/// check, so they must hold regardless of payment validity.
pub fn streaming_payment() -> Fuzzer<StreamingPayment> {
  fuzz.map8(
    fuzz.int(),
    cardano_fuzz.address(),
    fuzz.int(),
    fuzz.bytearray(),
    fuzz.bytearray(),
    fuzz.int(),
    fuzz.int(),
    fuzz.int(),
    fn(
      id,
      payout_address,
      paid_out_amount,
      policy_id,
      asset_name,
      amount_per_day,
      start_date,
      end_date,
    ) {
      StreamingPayment {
        id,
        payout_address,
        paid_out_amount,
        policy_id,
        asset_name,
        amount_per_day,
        start_date,
        end_date,
      }
    },
  )
}

/// 0–5 arbitrary streaming payments. Bounded so the fuzzer stays cheap while
/// still exercising the empty list and multi-payment cases.
pub fn streaming_payment_list() -> Fuzzer<List<StreamingPayment>> {
  fuzz.list_at_most(streaming_payment(), 5)
}
