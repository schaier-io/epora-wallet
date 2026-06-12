//// Unit tests for the validity-range bound extractors in `lib/time/bounds.ak`.
//// Every spend path funnels its time reads through these three helpers, so the
//// `Finite` vs open-end semantics are pinned here once: each helper over each
//// finite/open combination, plus the property that `finite_range` agrees with
//// its two halves on arbitrary finite windows.

use aiken/fuzz
use aiken/interval
use aiken/math
use time/bounds

test finite_lower_reads_finite_bound() {
  bounds.finite_lower(interval.between(10, 20)) == Some(10)
}

test finite_lower_is_none_for_open_lower_bound() {
  bounds.finite_lower(interval.before(20)) == None
}

test finite_upper_reads_finite_bound() {
  bounds.finite_upper(interval.between(10, 20)) == Some(20)
}

test finite_upper_is_none_for_open_upper_bound() {
  bounds.finite_upper(interval.after(10)) == None
}

test finite_range_reads_fully_bounded_window() {
  bounds.finite_range(interval.between(10, 20)) == Some((10, 20))
}

test finite_range_is_none_when_upper_open() {
  bounds.finite_range(interval.after(10)) == None
}

test finite_range_is_none_when_lower_open() {
  bounds.finite_range(interval.before(20)) == None
}

test finite_range_is_none_when_both_open() {
  bounds.finite_range(interval.everything) == None
}

// A zero-width window (lower == upper) is still a finite range — the common
// `interval.between(t, t)` shape the tests and the crank use.
test finite_range_accepts_zero_width_window() {
  bounds.finite_range(interval.between(7, 7)) == Some((7, 7))
}

// `finite_range` is exactly the conjunction of its two halves on any finite
// window (no re-spelled bound logic that could drift).
test prop_finite_range_agrees_with_halves(
  args via fuzz.both(fuzz.int(), fuzz.int()),
) {
  let (a, b) = args
  let lower = math.min(a, b)
  let upper = math.max(a, b)
  let validity_range = interval.between(lower, upper)
  and {
    bounds.finite_lower(validity_range) == Some(lower),
    bounds.finite_upper(validity_range) == Some(upper),
    bounds.finite_range(validity_range) == Some((lower, upper)),
  }
}
