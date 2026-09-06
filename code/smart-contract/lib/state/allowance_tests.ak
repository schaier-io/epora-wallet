//// Allowance list-shape tests through the production single-update interface.

use aiken/collection/list
use assets/entries as asset_entries
use constants
use state/allowance
use state/types.{AllowanceUpdate, User}
use test_support/state_builders as states

const tx_earliest_time = 100

const tx_latest_time = 110

const initial_allowance = 1_000_000

const actor_draw = 600_000

const other_draw = 250_000

const actor =
  states.allowance_user(
    1,
    "actor",
    initial_allowance,
    constants.milliseconds_per_day,
    False,
  )

const other =
  states.allowance_user(
    2,
    "other",
    initial_allowance,
    constants.milliseconds_per_day,
    False,
  )

const before = states.plain_user(3, "before")

const after = states.plain_user(4, "after")

const spent_actor =
  User {
    ..actor,
    remaining_allowance: [
      asset_entries.asset_entry(#"", #"", initial_allowance - actor_draw),
    ],
    next_allowance_reset: constants.milliseconds_per_day + tx_latest_time,
  }

const spent_other =
  User {
    ..other,
    remaining_allowance: [
      asset_entries.asset_entry(#"", #"", initial_allowance - other_draw),
    ],
    next_allowance_reset: constants.milliseconds_per_day + tx_latest_time,
  }

// Fix the validity bounds while exercising the production interface.
fn single_update(input: List<User>, output: List<User>) -> AllowanceUpdate {
  allowance.expect_single_allowance_update(
    input,
    output,
    tx_earliest_time,
    tx_latest_time,
  )
}

test single_allowance_update_accepts_each_actor_position() {
  let expected_update = AllowanceUpdate {
    changed_user_wallets: actor.user_wallets,
    spent_allowance: [asset_entries.asset_entry(#"", #"", actor_draw)],
  }
  list.all(
    [
      Pair([actor], [spent_actor]),
      Pair([actor, before, after], [spent_actor, before, after]),
      Pair([before, actor, after], [before, spent_actor, after]),
      Pair([before, after, actor], [before, after, spent_actor]),
    ],
    fn(Pair(input, output)) { single_update(input, output) == expected_update },
  )
}

// Use expect to evaluate these calls. An unused let binding removes them.
test single_allowance_update_rejects_empty_lists() fail {
  expect _ = single_update([], [])
  True
}

test single_allowance_update_rejects_multiple_changes() fail {
  expect _ = single_update(
    [actor, before, other],
    [spent_actor, before, spent_other],
  )
  True
}

test single_allowance_update_rejects_shorter_output() fail {
  expect _ = single_update([actor, before], [spent_actor])
  True
}

test single_allowance_update_rejects_output_exhausted_before_change() fail {
  expect _ = single_update([before, actor], [before])
  True
}

test single_allowance_update_rejects_reordered_suffix() fail {
  expect _ = single_update([actor, before, after], [spent_actor, after, before])
  True
}
