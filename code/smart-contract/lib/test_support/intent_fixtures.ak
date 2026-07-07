//// Intent-level constructors layered over `test_support/security_fixtures`:
//// each names a whole test *intent* (the canonical ADA streaming payment, an
//// operator action of any kind, a renewed proof-of-life, a readable unique
//// transaction id) so a test's only remaining literals are the values under
//// attack. Everything here is plain data construction — none of it touches a
//// validator (lib modules must not import a validator).

use aiken/primitive/bytearray
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use test_support/security_fixtures as fixtures

/// The canonical ADA streaming payment: 1_000_000 lovelace/day from day 0
/// through day 3 (end 259_200_000), payable to the key-hash address
/// `payee_key`. Only id / payee / paid-out vary across the suites.
pub fn ada_streaming_payment(
  id: Int,
  payee_key: ByteArray,
  paid_out: Int,
) -> StreamingPayment {
  ada_streaming_payment_ending(id, payee_key, paid_out, 259_200_000)
}

/// `ada_streaming_payment` with a chosen end date, for schedule-boundary
/// tests (matured removal, rescheduled stop).
pub fn ada_streaming_payment_ending(
  id: Int,
  payee_key: ByteArray,
  paid_out: Int,
  end_date: Int,
) -> StreamingPayment {
  fixtures.streaming_payment(
    id,
    fixtures.address_from_key(payee_key),
    paid_out,
    #"",
    #"",
    1_000_000,
    0,
    end_date,
  )
}

/// A `RunOperator` action of any path/kind pair — the general form of
/// `security_fixtures.operator_use_action`, for the `UpdateState` /
/// `ManageStreamingPayments` / `SetIntendedStakeCredential` kinds.
pub fn operator_action(
  path: state_types.OperatorPath,
  kind: state_types.OperatorActionKind,
) -> state_types.SttAction {
  state_types.RunOperator(state_types.OperatorAction { path, kind })
}

/// `state` with `proof_of_life.unlock_time` renewed to `unlock_time`. The
/// increment is preserved — a renewal moves the deadline, never the schedule.
pub fn with_renewed_proof_of_life(
  state: state_types.State,
  unlock_time: Int,
) -> state_types.State {
  state_types.State {
    ..state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(unlock_time),
      increment: state.proof_of_life.increment,
    },
  }
}

/// A 32-byte transaction id from a short prefix (at most 32 bytes),
/// right-padded with zero bytes — ids read as `tx_id(#"1a31")`, so
/// accidental duplicates are visually obvious.
pub fn tx_id(prefix: ByteArray) -> ByteArray {
  bytearray.concat(
    prefix,
    bytearray.from_int_big_endian(0, 32 - bytearray.length(prefix)),
  )
}
