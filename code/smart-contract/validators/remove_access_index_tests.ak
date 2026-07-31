//// Tests for the cheap per-entry removal action `RemoveAccessIndex` (the
//// budget-resilient "path out" for shrinking an access list one entry at a
//// time). Authorized by an operator (admin or multisig); re-checks only
//// recovery-reachability; exempt from the size caps so an over-cap wallet can
//// always recover.

use aiken/interval
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

// Binds the constant `eval_spend` legs (unused datum, fixture input ref) —
// partial application, not a §4 pure forwarder; only action + tx vary per test.
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

fn admin() -> state_types.User {
  state_types.User {
    ..states.base_user(),
    id: 1,
    user_wallets: ["admin"],
    is_admin: True,
  }
}

fn member(id: Int, wallet: ByteArray) -> state_types.User {
  state_types.User { ..states.base_user(), id, user_wallets: [wallet] }
}

fn remove_action(target: state_types.AccessIndexTarget) -> state_types.SttAction {
  fixtures.operator_action(
    state_types.Admin,
    state_types.RemoveAccessIndex(target),
  )
}

fn make_users(count: Int) -> List<state_types.User> {
  make_users_from(2, count)
}

fn make_users_from(next_id: Int, remaining: Int) -> List<state_types.User> {
  if remaining <= 0 {
    []
  } else {
    [member(next_id, "filler"), ..make_users_from(next_id + 1, remaining - 1)]
  }
}

// --- happy paths -----------------------------------------------------------

test remove_access_index_removes_user_at_index() {
  let input_state = states.base_state()
    |> states.with_users([admin(), member(2, "usera"), member(3, "userb")])
  let output_state = states.base_state()
    |> states.with_users([admin(), member(3, "userb")])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"b130"),
  )

  expect run_stt_spend(remove_action(state_types.UserIndex(1)), transaction)
}

test remove_access_index_removes_beneficiary_at_index() {
  let ben1 = state_types.Beneficiary {
    ..states.base_beneficiary(),
    id: 10,
    beneficiary_wallets: ["ben1"],
    unlock_after: Some(100),
  }
  let ben2 = state_types.Beneficiary {
    ..states.base_beneficiary(),
    id: 11,
    beneficiary_wallets: ["ben2"],
    unlock_after: Some(100),
  }
  let input_state = states.base_state()
    |> states.with_users([admin()])
    |> states.with_beneficiaries([ben1, ben2])
    |> states.with_proof_of_life(100, 50)
  let output_state = states.base_state()
    |> states.with_users([admin()])
    |> states.with_beneficiaries([ben2])
    |> states.with_proof_of_life(100, 50)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"b230"),
  )

  expect
    run_stt_spend(remove_action(state_types.BeneficiaryIndex(0)), transaction)
}

// An over-cap state (16 users) can still shrink: RemoveAccessIndex bypasses the
// size cap, so the budget-resilient recovery path always exists.
test remove_access_index_can_shrink_an_over_cap_user_list() {
  let over_cap = [admin(), ..make_users(16)]
  let input_state = states.base_state()
    |> states.with_users(over_cap)
  let output_state = states.base_state()
    |> states.with_users([admin(), ..make_users(15)])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"b330"),
  )

  // Remove the last filler user (index 16 in the 17-element list).
  expect run_stt_spend(remove_action(state_types.UserIndex(16)), transaction)
}

// --- rejections ------------------------------------------------------------

// Cannot remove the sole reachable access path (would brick the wallet).
test remove_access_index_cannot_remove_last_reachable_path() fail {
  let input_state = states.base_state()
    |> states.with_users([admin()])
  let output_state = states.base_state()
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"b430"),
  )

  expect run_stt_spend(remove_action(state_types.UserIndex(0)), transaction)
}

// Requires operator authority: a non-admin signer cannot prune.
test remove_access_index_requires_operator_authority() fail {
  let input_state = states.base_state()
    |> states.with_users([admin(), member(2, "usera")])
  let output_state = states.base_state()
    |> states.with_users([admin()])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["usera"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"b530"),
  )

  expect run_stt_spend(remove_action(state_types.UserIndex(1)), transaction)
}

// An out-of-range index removes nothing, so the length guard rejects it.
test remove_access_index_rejects_out_of_range_index() fail {
  let input_state = states.base_state()
    |> states.with_users([admin(), member(2, "usera")])
  let output_state = states.base_state()
    |> states.with_users([admin(), member(2, "usera")])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"b630"),
  )

  expect run_stt_spend(remove_action(state_types.UserIndex(5)), transaction)
}
