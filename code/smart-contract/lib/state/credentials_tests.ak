//// Exact ledger-width regressions for every credential shape stored in State.

use aiken/primitive/bytearray.{from_int_big_endian}
use cardano/address.{Address, Inline, Pointer, Script, VerificationKey}
use state/credentials

test credential_shape_accepts_28_byte_verification_key_hash() {
  expect credentials.is_valid(VerificationKey(from_int_big_endian(1, 28)))
}

test credential_shape_accepts_28_byte_script_hash() {
  expect credentials.is_valid(Script(from_int_big_endian(1, 28)))
}

test credential_shape_rejects_27_byte_hash() fail {
  expect credentials.is_valid(VerificationKey(from_int_big_endian(1, 27)))
}

test credential_shape_rejects_29_byte_hash() fail {
  expect credentials.is_valid(Script(from_int_big_endian(1, 29)))
}

test address_shape_rejects_malformed_payment_credential() fail {
  expect
    credentials.address_is_valid(
      Address {
        payment_credential: VerificationKey(from_int_big_endian(1, 27)),
        stake_credential: None,
      },
    )
}

test address_shape_rejects_malformed_inline_stake_credential() fail {
  expect
    credentials.address_is_valid(
      Address {
        payment_credential: VerificationKey(from_int_big_endian(1, 28)),
        stake_credential: Some(Inline(Script(from_int_big_endian(1, 29)))),
      },
    )
}

test address_shape_rejects_pointer_stake_credential() fail {
  expect
    credentials.address_is_valid(
      Address {
        payment_credential: VerificationKey(from_int_big_endian(1, 28)),
        stake_credential: Some(
          Pointer { slot_number: 1, transaction_index: 0, certificate_index: 0 },
        ),
      },
    )
}
