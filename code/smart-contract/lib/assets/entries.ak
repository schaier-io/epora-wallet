//// Flat asset-entry bundles (`List<AssetEntry>`): validation and conversion
//// between the datum/redeemer-facing entry lists (allowance, payout delta) and
//// the stdlib `assets.Value` the validators compute with.

use aiken/collection/list
use cardano/assets
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
    list.all(entries, fn(entry) { entry.quantity >= 0 })?,
    (list.length(list.unique(keys)) == list.length(keys))?,
  }
}

/// Rebuild a Value from normalized flat asset entries so validator logic can use cardano/assets helpers.
pub fn value_from_asset_entries(entries: List<AssetEntry>) -> assets.Value {
  list.foldl(
    entries,
    assets.zero,
    fn(entry, acc) {
      assets.merge(
        acc,
        assets.from_asset(entry.policy_id, entry.asset_name, entry.quantity),
      )
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

/// Bridge stdlib `assets.flatten(value)` (which yields tuples) into `AssetEntry`
/// records, so a computed `Value` can be compared against an `AssetEntries`-typed
/// datum/redeemer field (e.g. `spent_allowance`, `payout_delta`).
pub fn flatten_to_entries(value: assets.Value) -> List<AssetEntry> {
  list.map(
    assets.flatten(value),
    fn(entry) {
      let (policy_id, asset_name, quantity) = entry
      AssetEntry { policy_id, asset_name, quantity }
    },
  )
}

/// Check `predicate` against every asset in a `Value`, each presented as an
/// `AssetEntry` record — so call sites read `asset.policy_id` / `asset.asset_name`
/// / `asset.quantity` instead of destructuring a stdlib `assets.flatten` tuple.
/// DRYs the `list.all(assets.flatten(value), fn(asset) { … })` idiom used by the
/// wallet payout and streaming-funding reserve checks.
pub fn every_asset(
  value: assets.Value,
  predicate: fn(AssetEntry) -> Bool,
) -> Bool {
  list.all(flatten_to_entries(value), predicate)
}
