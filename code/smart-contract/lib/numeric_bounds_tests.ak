use constants
use numeric_bounds

test state_integer_cap_is_uint64_maximum() {
  constants.max_state_integer == 18_446_744_073_709_551_615
}

test non_negative_bound_accepts_uint64_edges() {
  numeric_bounds.is_non_negative_bounded(0) && numeric_bounds.is_non_negative_bounded(
    constants.max_state_integer,
  )
}

test non_negative_bound_rejects_above_uint64_edge() fail {
  numeric_bounds.is_non_negative_bounded(constants.max_state_integer + 1)
}

test non_negative_bound_rejects_negative() fail {
  numeric_bounds.is_non_negative_bounded(-1)
}
