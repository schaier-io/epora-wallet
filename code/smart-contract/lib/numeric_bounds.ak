//// Integer-width bounds for persistent State and redeemer payloads.

use constants

pub fn is_bounded(value: Int) -> Bool {
  value >= -constants.max_state_integer && value <= constants.max_state_integer
}

pub fn is_non_negative_bounded(value: Int) -> Bool {
  value >= 0 && value <= constants.max_state_integer
}

pub fn option_is_bounded(value: Option<Int>) -> Bool {
  when value is {
    Some(inner) -> is_bounded(inner)
    None -> True
  }
}

pub fn option_is_non_negative_bounded(value: Option<Int>) -> Bool {
  when value is {
    Some(inner) -> is_non_negative_bounded(inner)
    None -> True
  }
}
