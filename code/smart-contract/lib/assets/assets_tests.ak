use aiken/builtin
use aiken/collection/list
use aiken/fuzz
use assets/entries.{asset_entry, entries_are_valid, value_from_asset_entries}
use cardano/assets.{quantity_of}
use state/types.{AssetEntry}

// `entries_are_valid` is the shared well-formedness gate for flat asset-entry
// bundles, used both at config time (`state/configuration`) and on the
// allowance-update path (`state/allowance`). It must accept unique, non-negative
// bundles and reject negatives or duplicate (policy_id, asset_name) keys — the
// duplicate-key case being the one that previously slipped through the allowance
// update (a duplicate would be SUMMED by `value_from_asset_entries`, diverging
// from the per-entry bound checks).

test entries_are_valid_accepts_unique_nonnegative_bundle() {
  entries_are_valid([asset_entry(#"", #"", 5), asset_entry(#"aa", #"01", 3)])
}

test entries_are_valid_accepts_empty_bundle() {
  entries_are_valid([])
}

test entries_are_valid_rejects_duplicate_key() {
  !entries_are_valid([asset_entry(#"", #"", 5), asset_entry(#"", #"", 3)])
}

test entries_are_valid_rejects_negative_quantity() {
  !entries_are_valid([asset_entry(#"aa", #"01", -1)])
}

// ---------------------------------------------------------------------------
// Property-based coverage for the value primitives.
//
// The concrete tests above pin specific boundaries; the `prop_*` tests assert
// the same invariants hold over random inputs. Asset entries are generated with
// distinct keys (one byte of `policy_id` per index) so the cases under test are
// the quantity rules, not key collisions — which have their own dedicated tests.
// ---------------------------------------------------------------------------

// Build an entry list with guaranteed-distinct keys from a list of quantities.
// The index becomes the single-byte policy_id, so no two entries can collide.
fn entries_with_distinct_keys(quantities: List<Int>) -> List<AssetEntry> {
  list.indexed_map(
    quantities,
    fn(index, quantity) {
      asset_entry(builtin.cons_bytearray(index % 256, #""), #"", quantity)
    },
  )
}

// A bundle of distinct keys with only non-negative quantities is always valid.
test prop_entries_valid_for_distinct_nonneg_keys(
  quantities via fuzz.list(fuzz.int_at_least(0)),
) {
  entries_are_valid(entries_with_distinct_keys(quantities))
}

// A single negative quantity anywhere makes the whole bundle invalid, no matter
// how the rest is shaped.
test prop_entries_invalid_when_any_negative(
  quantities via fuzz.list(fuzz.int_at_least(0)),
) {
  let with_negative = entries_with_distinct_keys([-1, ..quantities])
  !entries_are_valid(with_negative)
}

// A repeated (policy_id, asset_name) key is always rejected: the duplicate-key
// guard must fire regardless of the surrounding entries.
test prop_entries_invalid_when_key_duplicated(quantity via fuzz.int_at_least(0)) {
  !entries_are_valid(
    [asset_entry(#"aa", #"01", quantity), asset_entry(#"aa", #"01", quantity)],
  )
}

// `value_from_asset_entries` rebuilds a Value whose per-key quantity equals the
// entry it came from (keys are distinct, so no summing occurs).
test prop_value_from_entries_preserves_each_quantity(
  quantities via fuzz.list(fuzz.int_at_least(0)),
) {
  let entries = entries_with_distinct_keys(quantities)
  let value = value_from_asset_entries(entries)
  list.all(
    entries,
    fn(entry) {
      quantity_of(value, entry.policy_id, entry.asset_name) == entry.quantity
    },
  )
}
