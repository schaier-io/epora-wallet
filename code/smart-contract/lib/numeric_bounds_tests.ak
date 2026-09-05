use constants
use numeric_bounds

test numeric_bound_accepts_signed_edges() {
  and {
    numeric_bounds.is_bounded(-constants.max_state_integer),
    numeric_bounds.is_bounded(constants.max_state_integer),
  }
}

test numeric_bound_rejects_above_signed_edge() fail {
  numeric_bounds.is_bounded(constants.max_state_integer + 1)
}

test numeric_bound_rejects_below_signed_edge() fail {
  numeric_bounds.is_bounded(-constants.max_state_integer - 1)
}

test non_negative_bound_rejects_negative() fail {
  numeric_bounds.is_non_negative_bounded(-1)
}
