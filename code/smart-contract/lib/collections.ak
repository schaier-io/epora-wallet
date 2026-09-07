//// Generic list helpers shared across contract modules.

use aiken/collection/list

/// True when no element occurs twice. THE single definition of the
/// no-duplicates quantifier (CLAUDE.md §3): every uniqueness rule (user ids,
/// beneficiary ids, beneficiary wallets, streaming-payment ids, asset-entry
/// keys) routes through here instead of re-spelling the
/// `length(unique(xs)) == length(xs)` idiom at each site.
pub fn all_unique(items: List<a>) -> Bool {
  when items is {
    [] -> True
    [item, ..remaining_items] ->
      !list.has(remaining_items, item) && all_unique(remaining_items)
  }
}
