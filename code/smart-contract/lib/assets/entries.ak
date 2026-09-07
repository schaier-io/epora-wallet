//// Flat asset-entry bundles (`List<AssetEntry>`): validation and conversion
//// between the datum/redeemer-facing entry lists (allowance, payout delta) and
//// the stdlib `assets.Value` the validators compute with.

use aiken/collection/list
use assets/identity as asset_identity
use cardano/assets
use collections
use constants
use state/types.{AssetEntry}

/// A flat asset-entries bundle (allowance, payout delta, …) is well-formed when
/// every quantity is non-negative AND no `(policy_id, asset_name)` key is listed
/// twice. The duplicate-key guard matters because callers collapse the list into
/// a `Value` with `value_from_asset_entries` (which SUMS duplicates): a per-entry
/// bound check would then disagree with the summed value, so a list with repeated
/// keys must be rejected before it is trusted. Shared by config-time validation
/// (`state/configuration`) and the allowance-update path (`state/allowance`) so
/// the two can never drift.
pub fn entries_are_valid(entries: List<AssetEntry>) -> Bool {
  let keys = list.map(
    entries,
    fn(entry) { (entry.policy_id, entry.asset_name) },
  )
  and {
    list.all(
      entries,
      fn(entry) {
        entry.quantity >= 0 && entry.quantity <= constants.max_state_integer && asset_identity.is_valid(
          entry.policy_id,
          entry.asset_name,
        )
      },
    )?,
    collections.all_unique(keys)?,
  }
}

/// Rebuild a Value from normalized flat asset entries so validator logic can use cardano/assets helpers.
pub fn value_from_asset_entries(entries: List<AssetEntry>) -> assets.Value {
  list.foldl(
    entries,
    assets.zero,
    fn(entry, acc) {
      assets.add(acc, entry.policy_id, entry.asset_name, entry.quantity)
    },
  )
}

/// Convenience constructor mirroring the old `(policy_id, asset_name, quantity)`
/// tuple — handy at construction sites (tests, builders).
pub fn asset_entry(
  policy_id: ByteArray,
  asset_name: ByteArray,
  quantity: Int,
) -> AssetEntry {
  AssetEntry { policy_id, asset_name, quantity }
}

/// Build `AssetEntry` records directly in the Value's policy and asset order.
/// The result can be compared with `spent_allowance` or `payout_delta`.
pub fn flatten_to_entries(value: assets.Value) -> List<AssetEntry> {
  assets.reduce(
    value,
    [],
    fn(policy_id, asset_name, quantity, acc) {
      [AssetEntry { policy_id, asset_name, quantity }, ..acc]
    },
  )
}
