//// Ledger-shape validation for every credential hash stored in State.
////
//// Aiken's `VerificationKeyHash` / `ScriptHash` types are ByteArray aliases;
//// they do not enforce the Blake2b-224 width themselves. State configuration
//// must therefore reject hashes that no real Cardano address or signatory can
//// represent, otherwise recovery reachability can count an impossible key.

use aiken/primitive/bytearray
use cardano/address.{
  Address, Credential, Inline, Pointer, Script, VerificationKey,
}
use constants

/// True exactly for a Cardano Blake2b-224 credential hash.
pub fn hash_has_ledger_width(hash: ByteArray) -> Bool {
  bytearray.length(hash) == constants.credential_hash_bytes
}

/// Validate either credential constructor's underlying hash width.
pub fn is_valid(credential: Credential) -> Bool {
  when credential is {
    VerificationKey(hash) -> hash_has_ledger_width(hash)
    Script(hash) -> hash_has_ledger_width(hash)
  }
}

/// Validate both hash-bearing parts of an address. Pointer stake credentials
/// are rejected entirely: new pointer addresses are forbidden from Conway
/// protocol version 9 onward, so State must not persist an unroutable address.
pub fn address_is_valid(address: Address) -> Bool {
  and {
    is_valid(address.payment_credential)?,
    when address.stake_credential is {
      Some(Inline(credential)) -> is_valid(credential)
      Some(Pointer { .. }) -> False
      None -> True
    },
  }
}

/// Validate a stored optional credential (`None` is the enterprise-wallet case).
pub fn optional_is_valid(credential: Option<Credential>) -> Bool {
  when credential is {
    Some(value) -> is_valid(value)
    None -> True
  }
}
