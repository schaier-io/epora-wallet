//// Integer-width bounds for non-negative persistent State and redeemer values.

use constants

pub fn is_non_negative_bounded(value: Int) -> Bool {
  value >= 0 && value <= constants.max_state_integer
}

pub fn option_is_non_negative_bounded(value: Option<Int>) -> Bool {
  when value is {
    Some(inner) -> is_non_negative_bounded(inner)
    None -> True
  }
}
