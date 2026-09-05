//// Production-wiring regressions for persistent and arithmetic scalar caps.

use aiken/interval
use assets/entries as asset_entries
use constants
use state/allowance
use state/configuration
use state/proof_of_life
use state/types.{AccessControl,
  Beneficiary, ProofOfLifeSettings, State, User} as state_types
use streaming_payments/shape
use streaming_payments/types.{StreamingPayment} as streaming_payment_types
use test_support/state_builders as states
use test_support/streaming_payment_test_helpers.{
  mk_address, mk_streaming_payment,
}

fn capped_user() -> User {
  User {
    ..states.admin_user(#"01"),
    id: constants.max_state_integer,
    next_allowance_reset: constants.max_state_integer,
    multi_sig_power: Some(constants.max_state_integer),
  }
}

fn capped_beneficiary() -> Beneficiary {
  Beneficiary {
    ..states.default_beneficiary(
      constants.max_state_integer,
      #"02",
      Some(constants.max_state_integer),
    ),
    weight: constants.max_state_integer,
  }
}

fn capped_state() -> State {
  State {
    ..states.base_state(),
    access: AccessControl {
      users: [capped_user()],
      multi_sig_threshold: Some(constants.max_state_integer),
      beneficiaries: [capped_beneficiary()],
    },
    proof_of_life: ProofOfLifeSettings {
      unlock_time: Some(constants.max_state_integer),
      increment: Some(constants.max_state_integer),
    },
    last_non_admin_payout_at: Some(constants.max_state_integer),
  }
}

fn state_with_user(user: User) -> State {
  let state = capped_state()
  State { ..state, access: AccessControl { ..state.access, users: [user] } }
}

fn state_with_beneficiary(beneficiary: Beneficiary) -> State {
  let state = capped_state()
  State {
    ..state,
    access: AccessControl { ..state.access, beneficiaries: [beneficiary] },
  }
}

test state_configuration_accepts_exact_scalar_caps() {
  configuration.expect_valid_state_configuration(capped_state())
}

test state_configuration_rejects_user_id_above_cap() fail {
  let user = User { ..capped_user(), id: constants.max_state_integer + 1 }
  configuration.expect_valid_state_configuration(state_with_user(user))
}

test state_configuration_rejects_user_reset_above_cap() fail {
  let user = User {
    ..capped_user(),
    next_allowance_reset: constants.max_state_integer + 1,
  }
  configuration.expect_valid_state_configuration(state_with_user(user))
}

test state_configuration_rejects_user_power_above_cap() fail {
  let user = User {
    ..capped_user(),
    multi_sig_power: Some(constants.max_state_integer + 1),
  }
  configuration.expect_valid_state_configuration(state_with_user(user))
}

test state_configuration_rejects_threshold_above_cap() fail {
  let state = capped_state()
  configuration.expect_valid_state_configuration(
    State {
      ..state,
      access: AccessControl {
        ..state.access,
        multi_sig_threshold: Some(constants.max_state_integer + 1),
      },
    },
  )
}

test state_configuration_rejects_beneficiary_id_above_cap() fail {
  let beneficiary = Beneficiary {
    ..capped_beneficiary(),
    id: constants.max_state_integer + 1,
  }
  configuration.expect_valid_state_configuration(
    state_with_beneficiary(beneficiary),
  )
}

test state_configuration_rejects_beneficiary_unlock_above_cap() fail {
  let beneficiary = Beneficiary {
    ..capped_beneficiary(),
    unlock_after: Some(constants.max_state_integer + 1),
  }
  configuration.expect_valid_state_configuration(
    state_with_beneficiary(beneficiary),
  )
}

test state_configuration_rejects_beneficiary_weight_above_cap() fail {
  let beneficiary = Beneficiary {
    ..capped_beneficiary(),
    weight: constants.max_state_integer + 1,
  }
  configuration.expect_valid_state_configuration(
    state_with_beneficiary(beneficiary),
  )
}

test state_configuration_rejects_proof_unlock_above_cap() fail {
  let state = capped_state()
  configuration.expect_valid_state_configuration(
    State {
      ..state,
      proof_of_life: ProofOfLifeSettings {
        ..state.proof_of_life,
        unlock_time: Some(constants.max_state_integer + 1),
      },
    },
  )
}

test state_configuration_rejects_proof_increment_above_cap() fail {
  let state = capped_state()
  configuration.expect_valid_state_configuration(
    State {
      ..state,
      proof_of_life: ProofOfLifeSettings {
        ..state.proof_of_life,
        increment: Some(constants.max_state_integer + 1),
      },
    },
  )
}

test state_configuration_rejects_cadence_stamp_above_cap() fail {
  configuration.expect_valid_state_configuration(
    State {
      ..capped_state(),
      last_non_admin_payout_at: Some(constants.max_state_integer + 1),
    },
  )
}

test proof_settings_reject_negative_unlock() fail {
  proof_of_life.expect_valid_settings(
    ProofOfLifeSettings { unlock_time: Some(-1), increment: Some(1) },
  )
}

test proof_settings_reject_nonpositive_increment() fail {
  proof_of_life.expect_valid_settings(
    ProofOfLifeSettings { unlock_time: Some(0), increment: Some(0) },
  )
}

fn allowance_user(next_reset: Int, remaining: Int) -> User {
  User {
    ..states.base_user(),
    per_day_allowance: [
      asset_entries.asset_entry(#"", #"", constants.max_state_integer),
    ],
    remaining_allowance: [asset_entries.asset_entry(#"", #"", remaining)],
    next_allowance_reset: next_reset,
  }
}

test allowance_update_accepts_exact_reset_and_quantity_caps() {
  let old_user = allowance_user(
    constants.max_state_integer,
    constants.max_state_integer,
  )
  let new_user = allowance_user(
    constants.max_state_integer,
    constants.max_state_integer - 1,
  )
  expect [_] = allowance.expect_allowance_updates([old_user], [new_user], 0, 0)
}

test allowance_update_rejects_reset_above_cap() fail {
  let overflow = constants.max_state_integer + 1
  let old_user = allowance_user(overflow, constants.max_state_integer)
  let new_user = allowance_user(overflow, constants.max_state_integer - 1)
  expect [_] = allowance.expect_allowance_updates([old_user], [new_user], 0, 0)
}

test asset_entries_accept_exact_quantity_cap() {
  asset_entries.entries_are_valid(
    [asset_entries.asset_entry(#"", #"", constants.max_state_integer)],
  )
}

test asset_entries_reject_quantity_above_cap() {
  !asset_entries.entries_are_valid(
    [asset_entries.asset_entry(#"", #"", constants.max_state_integer + 1)],
  )
}

fn capped_stream() -> StreamingPayment {
  StreamingPayment {
    ..mk_streaming_payment(
      constants.max_state_integer,
      mk_address(#"03"),
      constants.max_state_integer,
      constants.max_state_integer,
      constants.max_state_integer,
    ),
    start_date: constants.max_state_integer - constants.milliseconds_per_day,
  }
}

test streaming_shape_accepts_exact_scalar_caps() {
  let exact_start_cap = StreamingPayment {
    ..mk_streaming_payment(
      constants.max_state_integer - 1,
      mk_address(#"04"),
      0,
      0,
      constants.max_state_integer,
    ),
    start_date: constants.max_state_integer,
  }
  shape.is_valid([capped_stream(), exact_start_cap])
}

test streaming_shape_rejects_id_above_cap() {
  let stream = StreamingPayment {
    ..capped_stream(),
    id: constants.max_state_integer + 1,
  }
  !shape.is_valid([stream])
}

test streaming_shape_rejects_end_above_cap() {
  let stream = mk_streaming_payment(
    0,
    mk_address(#"03"),
    0,
    0,
    constants.max_state_integer + 1,
  )
  !shape.is_valid([stream])
}

test streaming_shape_rejects_rate_above_cap() {
  let stream = mk_streaming_payment(
    0,
    mk_address(#"03"),
    0,
    constants.max_state_integer + 1,
    0,
  )
  !shape.is_valid([stream])
}

test streaming_shape_rejects_paid_out_above_cap() {
  let stream = StreamingPayment {
    ..capped_stream(),
    paid_out_amount: constants.max_state_integer + 1,
  }
  !shape.is_valid([stream])
}

test streaming_shape_rejects_lifetime_total_above_cap() {
  let stream = mk_streaming_payment(
    0,
    mk_address(#"03"),
    0,
    constants.max_state_integer,
    constants.milliseconds_per_day * 2,
  )
  !shape.is_valid([stream])
}

test streaming_shape_rejects_negative_start() {
  let stream = StreamingPayment {
    ..mk_streaming_payment(0, mk_address(#"03"), 0, 0, 0),
    start_date: -1,
  }
  !shape.is_valid([stream])
}

test streaming_shape_rejects_negative_end() {
  !shape.is_valid([mk_streaming_payment(0, mk_address(#"03"), 0, 0, -1)])
}

test streaming_shape_rejects_negative_rate() {
  !shape.is_valid([mk_streaming_payment(0, mk_address(#"03"), 0, -1, 0)])
}

test streaming_shape_rejects_negative_paid_out() {
  !shape.is_valid([mk_streaming_payment(0, mk_address(#"03"), -1, 0, 0)])
}

fn proof_state(unlock_time: Int, increment: Int) -> State {
  states.base_state()
    |> states.with_proof_of_life(unlock_time, increment)
}

test renewal_window_accepts_exact_scalar_cap() {
  proof_of_life.expect_valid_renewal_window(
    interval.between(
      constants.max_state_integer - 1,
      constants.max_state_integer,
    ),
    proof_state(constants.max_state_integer - 1, 1),
    proof_state(constants.max_state_integer, 1),
  )
}

test renewal_window_rejects_updated_unlock_above_cap() fail {
  proof_of_life.expect_valid_renewal_window(
    interval.between(
      constants.max_state_integer - 1,
      constants.max_state_integer,
    ),
    proof_state(constants.max_state_integer - 1, 2),
    proof_state(constants.max_state_integer + 1, 2),
  )
}

test renewal_window_rejects_negative_tx_lower_bound() fail {
  proof_of_life.expect_valid_renewal_window(
    interval.between(-1, 0),
    proof_state(0, 2),
    proof_state(1, 2),
  )
}

test renewal_window_rejects_tx_upper_bound_above_cap() fail {
  proof_of_life.expect_valid_renewal_window(
    interval.between(
      constants.max_state_integer - 1,
      constants.max_state_integer + 1,
    ),
    proof_state(constants.max_state_integer - 1, 2),
    proof_state(constants.max_state_integer, 2),
  )
}
