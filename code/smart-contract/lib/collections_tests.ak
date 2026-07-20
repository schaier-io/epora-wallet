//// Unit tests for `lib/collections.ak`.

use collections

test all_unique_accepts_empty_list() {
  collections.all_unique([])
}

test all_unique_accepts_distinct_elements() {
  collections.all_unique([1, 2, 3])
}

test all_unique_rejects_duplicate_elements() {
  !collections.all_unique([1, 2, 1])
}
