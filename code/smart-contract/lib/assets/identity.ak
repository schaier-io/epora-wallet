//// Ledger-shape validation for asset identifiers persisted in State.
////
//// PolicyId and AssetName are ByteArray aliases in Aiken, so their ledger
//// widths are not enforced by the type system. Invalid identifiers would make
//// an allowance or streaming obligation impossible to represent in a Cardano
//// Value and could strand value behind an unreachable configuration.

use aiken/primitive/bytearray
use constants

/// True for canonical ADA (`#"", #""`) or a native asset whose policy id is
/// exactly Blake2b-224 width and whose asset name is at most 32 bytes. An empty
/// native asset name is valid; a non-empty name under the empty ADA policy is
/// not.
pub fn is_valid(policy_id: ByteArray, asset_name: ByteArray) -> Bool {
  if policy_id == #"" {
    asset_name == #""
  } else {
    and {
      (bytearray.length(policy_id) == constants.policy_id_bytes)?,
      (bytearray.length(asset_name) <= constants.max_asset_name_bytes)?,
    }
  }
}
