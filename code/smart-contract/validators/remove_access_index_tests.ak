//// Tests for the cheap per-entry removal action `RemoveAccessIndex` (the
//// budget-resilient "path out" for shrinking an access list one entry at a
//// time). Authorized by an operator (admin or multisig); re-checks only
//// recovery-reachability; exempt from the size caps so an over-cap wallet can
//// always recover.

use aiken/interval
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures

fn admin() -> state_types.User {
  fixtures.user(1, ["admin"], [], [], 0, False, None, True)
}

fn member(id: Int, wallet: ByteArray) -> state_types.User {
  fixtures.user(id, [wallet], [], [], 0, False, None, False)
}

fn remove_action(target: state_types.AccessIndexTarget) -> state_types.SttAction {
  state_types.RunOperator(
    state_types.OperatorAction {
      path: state_types.Admin,
      kind: state_types.RemoveAccessIndex(target),
    },
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
  let input_state = fixtures.state(
    [admin(), member(2, "usera"), member(3, "userb")],
    None,
    [],
    None,
    None,
    [],
  )
  let output_state = fixtures.state(
    [admin(), member(3, "userb")],
    None,
    [],
    None,
    None,
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"b130000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      remove_action(state_types.UserIndex(1)),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test remove_access_index_removes_beneficiary_at_index() {
  let ben1 = fixtures.beneficiary(10, ["ben1"], Some(100), 1)
  let ben2 = fixtures.beneficiary(11, ["ben2"], Some(100), 1)
  let input_state = fixtures.state(
    [admin()],
    None,
    [ben1, ben2],
    Some(100),
    Some(50),
    [],
  )
  let output_state = fixtures.state(
    [admin()],
    None,
    [ben2],
    Some(100),
    Some(50),
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"b230000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      remove_action(state_types.BeneficiaryIndex(0)),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// An over-cap state (16 users) can still shrink: RemoveAccessIndex bypasses the
// size cap, so the budget-resilient recovery path always exists.
test remove_access_index_can_shrink_an_over_cap_user_list() {
  let over_cap = [admin(), ..make_users(16)]
  let input_state = fixtures.state(over_cap, None, [], None, None, [])
  let output_state = fixtures.state(
    [admin(), ..make_users(15)],
    None,
    [],
    None,
    None,
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"b330000000000000000000000000000000000000000000000000000000000000",
  )

  // Remove the last filler user (index 16 in the 17-element list).
  expect
    stt.eval_spend(
      None,
      remove_action(state_types.UserIndex(16)),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// --- rejections ------------------------------------------------------------

// Cannot remove the sole reachable access path (would brick the wallet).
test remove_access_index_cannot_remove_last_reachable_path() fail {
  let input_state = fixtures.state([admin()], None, [], None, None, [])
  let output_state = fixtures.state([], None, [], None, None, [])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"b430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      remove_action(state_types.UserIndex(0)),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// Requires operator authority: a non-admin signer cannot prune.
test remove_access_index_requires_operator_authority() fail {
  let input_state = fixtures.state(
    [admin(), member(2, "usera")],
    None,
    [],
    None,
    None,
    [],
  )
  let output_state = fixtures.state([admin()], None, [], None, None, [])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["usera"],
    input_state,
    output_state,
    [],
    #"b530000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      remove_action(state_types.UserIndex(1)),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// An out-of-range index removes nothing, so the length guard rejects it.
test remove_access_index_rejects_out_of_range_index() fail {
  let input_state = fixtures.state(
    [admin(), member(2, "usera")],
    None,
    [],
    None,
    None,
    [],
  )
  let output_state = fixtures.state(
    [admin(), member(2, "usera")],
    None,
    [],
    None,
    None,
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"b630000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      remove_action(state_types.UserIndex(5)),
      fixtures.stt_input_ref(),
      transaction,
    )
}
