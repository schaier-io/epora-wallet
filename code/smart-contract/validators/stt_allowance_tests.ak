//// STT allowance-use (UseAllowance) transition tests.

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/intent_fixtures as intent
use test_support/security_fixtures as fixtures

// Binds the constant `eval_spend` legs (unused datum, fixture input ref) —
// partial application, not a §4 pure forwarder; only action + tx vary per test.
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

test allowance_use_accepts_exact_single_user_spend() {
  let state_input = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let state_output = state_types.State {
    ..state_input,
    access: state_types.AccessControl {
      users: [
        state_types.User {
          ..fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False),
          remaining_allowance: assets.from_lovelace(400_000)
            |> asset_entries.flatten_to_entries,
          next_allowance_reset: 86_400_110,
        },
      ],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    state_input,
    state_output,
    [],
    #"2130000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.UseAllowance(
        assets.from_lovelace(600_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test allowance_use_next_reset_anchors_to_upper_bound() {
  let state_input = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let state_output = state_types.State {
    ..state_input,
    access: state_types.AccessControl {
      users: [
        state_types.User {
          ..fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False),
          remaining_allowance: assets.from_lovelace(400_000)
            |> asset_entries.flatten_to_entries,
          next_allowance_reset: 86_400_200,
        },
      ],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 200),
    ["user1"],
    state_input,
    state_output,
    [],
    #"2150000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.UseAllowance(
        assets.from_lovelace(600_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

// Positive proof-of-life-renewal leg of allowance use: the changed ELIGIBLE
// user (non-admin, `can_renew_proof_of_life: True`) spends allowance AND pushes
// `unlock_time` forward. With `secured_state`'s 100/50 schedule and the tx
// window [100, 110], the legal renewal range is [110, 150] (>= tx upper bound,
// <= tx lower bound + increment); 150 pins the inclusive cap. The only other
// end-to-end coverage of this branch is the wrong-user FAIL test in
// `security_attack_log_tests.ak`.
test allowance_use_accepts_proof_of_life_renewal_by_eligible_user() {
  let state_input = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, True)],
    [],
    [],
  )
  let spent_state = state_types.State {
    ..state_input,
    access: state_types.AccessControl {
      users: [
        state_types.User {
          ..fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, True),
          remaining_allowance: assets.from_lovelace(400_000)
            |> asset_entries.flatten_to_entries,
          next_allowance_reset: 86_400_110,
        },
      ],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let state_output = intent.with_renewed_proof_of_life(spent_state, 150)
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    state_input,
    state_output,
    [],
    #"2c30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.UseAllowance(
        assets.from_lovelace(600_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test allowance_use_rejects_static_field_changes() fail {
  let state_input = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let state_output = state_types.State {
    ..state_input,
    access: state_types.AccessControl {
      users: [
        state_types.User {
          ..fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False),
          user_wallets: ["user2"],
          remaining_allowance: assets.from_lovelace(400_000)
            |> asset_entries.flatten_to_entries,
          next_allowance_reset: 86_400_110,
        },
      ],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    state_input,
    state_output,
    [],
    #"2230000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.UseAllowance(
        assets.from_lovelace(600_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test allowance_use_rejects_zero_spend_update() fail {
  let state_input = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    state_input,
    state_input,
    [],
    #"2330000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.UseAllowance(
        assets.from_lovelace(0) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test allowance_use_rejects_allowance_increase() fail {
  let state_input = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let state_output = state_types.State {
    ..state_input,
    access: state_types.AccessControl {
      users: [
        state_types.User {
          ..fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False),
          remaining_allowance: assets.from_lovelace(1_200_000)
            |> asset_entries.flatten_to_entries,
          next_allowance_reset: 86_400_110,
        },
      ],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    state_input,
    state_output,
    [],
    #"2430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.UseAllowance(
        assets.from_lovelace(0) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

// Audit L3 / A1 spend-path leg. `UseAllowance` does not re-run config validation,
// so the entry-count cap is enforced again at lib/state/allowance.ak:128. The
// existing `max_allowance_entries` tests only exercise the config path; this pins
// the SPEND path. The output legitimately spends 600_000 lovelace (as the accept
// test) but PADS `remaining_allowance` to 11 entries with fresh zero-quantity
// keys — every other check passes (unique non-negative keys, valid draw-down,
// rebased reset), so the count cap is the sole guard and must reject it. Without
// it a spender could grow the bundle 10 entries per tx until later spends blow the
// execution budget (the A1 stranding vector).
test allowance_use_rejects_remaining_allowance_over_cap_padding() fail {
  let state_input = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let state_output = state_types.State {
    ..state_input,
    access: state_types.AccessControl {
      users: [
        state_types.User {
          ..fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False),
          remaining_allowance: [
            asset_entries.asset_entry(#"", #"", 400_000),
            asset_entries.asset_entry(#"01", #"01", 0),
            asset_entries.asset_entry(#"01", #"02", 0),
            asset_entries.asset_entry(#"01", #"03", 0),
            asset_entries.asset_entry(#"01", #"04", 0),
            asset_entries.asset_entry(#"01", #"05", 0),
            asset_entries.asset_entry(#"01", #"06", 0),
            asset_entries.asset_entry(#"01", #"07", 0),
            asset_entries.asset_entry(#"01", #"08", 0),
            asset_entries.asset_entry(#"01", #"09", 0),
            asset_entries.asset_entry(#"01", #"0a", 0),
          ],
          next_allowance_reset: 86_400_110,
        },
      ],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    state_input,
    state_output,
    [],
    #"2b30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.UseAllowance(
        assets.from_lovelace(600_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}
