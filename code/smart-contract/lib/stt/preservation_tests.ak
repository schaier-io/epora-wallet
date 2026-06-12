//// Per-predicate unit tests for `lib/stt/preservation.ak`.
////
//// Each predicate encodes "which `State` fields must stay equal" for one
//// action; a false PASS here is the "state mutation slips through a spend
//// path" failure class, so every predicate gets an accept case for each field
//// it permits to change and a reject case for each field it must pin. The
//// action-level integration tests (`stt_*_tests.ak`) drive these through
//// `eval_spend`; these tests pin the predicates' own boundaries directly.
////
//// NOTE: `intended_stake_credential` and `last_permissionless_payout_at` are
//// deliberately OUTSIDE every predicate — they are enforced once, centrally,
//// in `eval_spend` (see `validators/stt.ak`). Pinned by the
//// `..._ignores_centrally_guarded_fields` tests below so the omission always
//// reads as intent, not as a missed field.

use cardano/address.{Address, Script}
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use stt/preservation

// --- fixtures ---------------------------------------------------------------

fn mk_user(id: Int) -> state_types.User {
  state_types.User {
    id,
    user_wallets: [#"aa"],
    per_day_allowance: [],
    remaining_allowance: [],
    next_allowance_reset: 0,
    can_renew_proof_of_life: False,
    multi_sig_power: None,
    is_admin: True,
  }
}

fn mk_beneficiary(id: Int) -> state_types.Beneficiary {
  state_types.Beneficiary {
    id,
    beneficiary_wallets: [#"bb"],
    unlock_after: None,
    weight: 1,
  }
}

fn mk_streaming_payment(id: Int) -> StreamingPayment {
  StreamingPayment {
    id,
    payout_address: Address {
      payment_credential: Script(#"01"),
      stake_credential: None,
    },
    paid_out_amount: 0,
    policy_id: #"",
    asset_name: #"",
    amount_per_day: 1,
    start_date: 0,
    end_date: 10,
  }
}

// Every field carries a non-default value so an accidentally-dropped comparison
// in a predicate cannot hide behind two equal defaults.
fn base_state() -> state_types.State {
  state_types.State {
    access: state_types.AccessControl {
      users: [mk_user(1), mk_user(2)],
      multi_sig_threshold: Some(2),
      beneficiaries: [mk_beneficiary(1), mk_beneficiary(2)],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(1_000),
      increment: Some(100),
    },
    streaming_payments: [mk_streaming_payment(7)],
    wallet_name: #"01",
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
}

fn with_unlock_time(
  state: state_types.State,
  unlock_time: Option<Int>,
) -> state_types.State {
  state_types.State {
    ..state,
    proof_of_life: state_types.ProofOfLifeSettings {
      ..state.proof_of_life,
      unlock_time,
    },
  }
}

fn with_increment(
  state: state_types.State,
  increment: Option<Int>,
) -> state_types.State {
  state_types.State {
    ..state,
    proof_of_life: state_types.ProofOfLifeSettings {
      ..state.proof_of_life,
      increment,
    },
  }
}

fn with_users(
  state: state_types.State,
  users: List<state_types.User>,
) -> state_types.State {
  state_types.State {
    ..state,
    access: state_types.AccessControl { ..state.access, users },
  }
}

fn with_threshold(
  state: state_types.State,
  multi_sig_threshold: Option<Int>,
) -> state_types.State {
  state_types.State {
    ..state,
    access: state_types.AccessControl { ..state.access, multi_sig_threshold },
  }
}

fn with_beneficiaries(
  state: state_types.State,
  beneficiaries: List<state_types.Beneficiary>,
) -> state_types.State {
  state_types.State {
    ..state,
    access: state_types.AccessControl { ..state.access, beneficiaries },
  }
}

fn with_streaming_payments(
  state: state_types.State,
  streaming_payments: List<StreamingPayment>,
) -> state_types.State {
  state_types.State { ..state, streaming_payments }
}

fn with_wallet_name(
  state: state_types.State,
  wallet_name: ByteArray,
) -> state_types.State {
  state_types.State { ..state, wallet_name }
}

// --- state_unchanged_except_pol_unlock_time (Use, RenewProofOfLife) ---------

test pol_unlock_only_accepts_unlock_time_change() {
  preservation.state_unchanged_except_pol_unlock_time(
    base_state(),
    with_unlock_time(base_state(), Some(2_000)),
  )
}

test pol_unlock_only_accepts_identical_state() {
  preservation.state_unchanged_except_pol_unlock_time(
    base_state(),
    base_state(),
  )
}

test pol_unlock_only_rejects_access_change() {
  !preservation.state_unchanged_except_pol_unlock_time(
    base_state(),
    with_users(base_state(), [mk_user(1)]),
  )
}

test pol_unlock_only_rejects_increment_change() {
  !preservation.state_unchanged_except_pol_unlock_time(
    base_state(),
    with_increment(base_state(), Some(999)),
  )
}

test pol_unlock_only_rejects_streaming_payments_change() {
  !preservation.state_unchanged_except_pol_unlock_time(
    base_state(),
    with_streaming_payments(base_state(), []),
  )
}

test pol_unlock_only_rejects_wallet_name_change() {
  !preservation.state_unchanged_except_pol_unlock_time(
    base_state(),
    with_wallet_name(base_state(), #"02"),
  )
}

// --- state_unchanged_except_pol_unlock_time_and_streaming_payments
//     (ManageStreamingPayments) ----------------------------------------------

test pol_and_streaming_accepts_unlock_and_streaming_change() {
  preservation.state_unchanged_except_pol_unlock_time_and_streaming_payments(
    base_state(),
    base_state()
      |> with_unlock_time(Some(2_000))
      |> with_streaming_payments([]),
  )
}

test pol_and_streaming_rejects_access_change() {
  !preservation.state_unchanged_except_pol_unlock_time_and_streaming_payments(
    base_state(),
    with_threshold(base_state(), Some(1)),
  )
}

test pol_and_streaming_rejects_increment_change() {
  !preservation.state_unchanged_except_pol_unlock_time_and_streaming_payments(
    base_state(),
    with_increment(base_state(), None),
  )
}

test pol_and_streaming_rejects_wallet_name_change() {
  !preservation.state_unchanged_except_pol_unlock_time_and_streaming_payments(
    base_state(),
    with_wallet_name(base_state(), #"02"),
  )
}

// --- state_unchanged_except_users_and_pol_unlock_time (UseAllowance) --------

test users_and_pol_accepts_users_and_unlock_change() {
  preservation.state_unchanged_except_users_and_pol_unlock_time(
    base_state(),
    base_state()
      |> with_users([mk_user(1)])
      |> with_unlock_time(Some(2_000)),
  )
}

test users_and_pol_rejects_threshold_change() {
  !preservation.state_unchanged_except_users_and_pol_unlock_time(
    base_state(),
    with_threshold(base_state(), Some(1)),
  )
}

test users_and_pol_rejects_beneficiaries_change() {
  !preservation.state_unchanged_except_users_and_pol_unlock_time(
    base_state(),
    with_beneficiaries(base_state(), [mk_beneficiary(1)]),
  )
}

test users_and_pol_rejects_increment_change() {
  !preservation.state_unchanged_except_users_and_pol_unlock_time(
    base_state(),
    with_increment(base_state(), Some(999)),
  )
}

test users_and_pol_rejects_streaming_payments_change() {
  !preservation.state_unchanged_except_users_and_pol_unlock_time(
    base_state(),
    with_streaming_payments(base_state(), []),
  )
}

test users_and_pol_rejects_wallet_name_change() {
  !preservation.state_unchanged_except_users_and_pol_unlock_time(
    base_state(),
    with_wallet_name(base_state(), #"02"),
  )
}

// --- state_completely_unchanged (Consolidate) --------------------------------

test completely_unchanged_accepts_identical_state() {
  preservation.state_completely_unchanged(base_state(), base_state())
}

test completely_unchanged_rejects_access_change() {
  !preservation.state_completely_unchanged(
    base_state(),
    with_users(base_state(), [mk_user(1)]),
  )
}

test completely_unchanged_rejects_pol_change() {
  !preservation.state_completely_unchanged(
    base_state(),
    with_unlock_time(base_state(), Some(2_000)),
  )
}

test completely_unchanged_rejects_streaming_payments_change() {
  !preservation.state_completely_unchanged(
    base_state(),
    with_streaming_payments(base_state(), []),
  )
}

test completely_unchanged_rejects_wallet_name_change() {
  !preservation.state_completely_unchanged(
    base_state(),
    with_wallet_name(base_state(), #"02"),
  )
}

// `intended_stake_credential` and `last_permissionless_payout_at` are NOT
// compared by the predicates — they are pinned once, centrally, in `eval_spend`
// (validators/stt.ak). This test documents that boundary: even the strictest
// predicate accepts a change to either field.
test completely_unchanged_ignores_centrally_guarded_fields() {
  let stamped = state_types.State {
    ..base_state(),
    intended_stake_credential: Some(Script(#"ff")),
    last_permissionless_payout_at: Some(123),
  }
  preservation.state_completely_unchanged(base_state(), stamped)
}

// --- state_unchanged_except_beneficiary_removed (UseBeneficiary) ------------

test beneficiary_removed_accepts_exact_removal() {
  preservation.state_unchanged_except_beneficiary_removed(
    base_state(),
    with_beneficiaries(base_state(), [mk_beneficiary(2)]),
    1,
  )
}

test beneficiary_removed_rejects_when_nothing_removed() {
  !preservation.state_unchanged_except_beneficiary_removed(
    base_state(),
    base_state(),
    1,
  )
}

test beneficiary_removed_rejects_wrong_beneficiary_removed() {
  // Declared id 1, but the output dropped beneficiary 2 instead.
  !preservation.state_unchanged_except_beneficiary_removed(
    base_state(),
    with_beneficiaries(base_state(), [mk_beneficiary(1)]),
    1,
  )
}

test beneficiary_removed_rejects_removing_more_than_one() {
  !preservation.state_unchanged_except_beneficiary_removed(
    base_state(),
    with_beneficiaries(base_state(), []),
    1,
  )
}

test beneficiary_removed_rejects_users_change_alongside() {
  !preservation.state_unchanged_except_beneficiary_removed(
    base_state(),
    base_state()
      |> with_beneficiaries([mk_beneficiary(2)])
      |> with_users([mk_user(1)]),
    1,
  )
}

test beneficiary_removed_rejects_pol_change_alongside() {
  !preservation.state_unchanged_except_beneficiary_removed(
    base_state(),
    base_state()
      |> with_beneficiaries([mk_beneficiary(2)])
      |> with_unlock_time(Some(2_000)),
    1,
  )
}

// --- state_unchanged_except_streaming_payments (PayStreamingPayment) --------

test streaming_only_accepts_streaming_payments_change() {
  preservation.state_unchanged_except_streaming_payments(
    base_state(),
    with_streaming_payments(base_state(), []),
  )
}

test streaming_only_rejects_access_change() {
  !preservation.state_unchanged_except_streaming_payments(
    base_state(),
    with_users(base_state(), [mk_user(1)]),
  )
}

test streaming_only_rejects_pol_unlock_change() {
  !preservation.state_unchanged_except_streaming_payments(
    base_state(),
    with_unlock_time(base_state(), Some(2_000)),
  )
}

test streaming_only_rejects_wallet_name_change() {
  !preservation.state_unchanged_except_streaming_payments(
    base_state(),
    with_wallet_name(base_state(), #"02"),
  )
}

// --- state_unchanged_except_intended_stake_credential
//     (SetIntendedStakeCredential) -------------------------------------------

// The predicate pins everything it compares; the changed credential itself is
// checked against the redeemer target in `eval_set_intended_stake_credential`.
test intended_stake_accepts_stake_credential_change() {
  preservation.state_unchanged_except_intended_stake_credential(
    base_state(),
    state_types.State {
      ..base_state(),
      intended_stake_credential: Some(Script(#"ff")),
    },
  )
}

test intended_stake_rejects_access_change() {
  !preservation.state_unchanged_except_intended_stake_credential(
    base_state(),
    with_threshold(base_state(), None),
  )
}

test intended_stake_rejects_pol_change() {
  !preservation.state_unchanged_except_intended_stake_credential(
    base_state(),
    with_increment(base_state(), Some(999)),
  )
}

test intended_stake_rejects_streaming_payments_change() {
  !preservation.state_unchanged_except_intended_stake_credential(
    base_state(),
    with_streaming_payments(base_state(), []),
  )
}

test intended_stake_rejects_wallet_name_change() {
  !preservation.state_unchanged_except_intended_stake_credential(
    base_state(),
    with_wallet_name(base_state(), #"02"),
  )
}

// --- state_unchanged_except_access_index_removed (RemoveAccessIndex) --------

test user_index_accepts_removal_at_index() {
  preservation.state_unchanged_except_access_index_removed(
    base_state(),
    with_users(base_state(), [mk_user(1)]),
    state_types.UserIndex(1),
  )
}

test user_index_rejects_out_of_range_index() {
  // `remove_at` is a no-op out of range, so the length guard must fire.
  !preservation.state_unchanged_except_access_index_removed(
    base_state(),
    base_state(),
    state_types.UserIndex(5),
  )
}

test user_index_rejects_wrong_entry_dropped() {
  // Target index 1 (user id 2) but the output dropped index 0 (user id 1).
  !preservation.state_unchanged_except_access_index_removed(
    base_state(),
    with_users(base_state(), [mk_user(2)]),
    state_types.UserIndex(1),
  )
}

test user_index_rejects_beneficiaries_change_alongside() {
  !preservation.state_unchanged_except_access_index_removed(
    base_state(),
    base_state()
      |> with_users([mk_user(1)])
      |> with_beneficiaries([mk_beneficiary(1)]),
    state_types.UserIndex(1),
  )
}

test user_index_rejects_threshold_change_alongside() {
  !preservation.state_unchanged_except_access_index_removed(
    base_state(),
    base_state()
      |> with_users([mk_user(1)])
      |> with_threshold(Some(1)),
    state_types.UserIndex(1),
  )
}

test beneficiary_index_accepts_removal_at_index() {
  preservation.state_unchanged_except_access_index_removed(
    base_state(),
    with_beneficiaries(base_state(), [mk_beneficiary(1)]),
    state_types.BeneficiaryIndex(1),
  )
}

test beneficiary_index_rejects_out_of_range_index() {
  !preservation.state_unchanged_except_access_index_removed(
    base_state(),
    base_state(),
    state_types.BeneficiaryIndex(5),
  )
}

test beneficiary_index_rejects_users_change_alongside() {
  !preservation.state_unchanged_except_access_index_removed(
    base_state(),
    base_state()
      |> with_beneficiaries([mk_beneficiary(1)])
      |> with_users([mk_user(1)]),
    state_types.BeneficiaryIndex(1),
  )
}

test beneficiary_index_rejects_streaming_payments_change_alongside() {
  !preservation.state_unchanged_except_access_index_removed(
    base_state(),
    base_state()
      |> with_beneficiaries([mk_beneficiary(1)])
      |> with_streaming_payments([]),
    state_types.BeneficiaryIndex(1),
  )
}

// --- remove_at ---------------------------------------------------------------

test remove_at_drops_first_element() {
  preservation.remove_at([1, 2, 3], 0) == [2, 3]
}

test remove_at_drops_middle_element() {
  preservation.remove_at([1, 2, 3], 1) == [1, 3]
}

test remove_at_drops_last_element() {
  preservation.remove_at([1, 2, 3], 2) == [1, 2]
}

test remove_at_out_of_range_returns_list_unchanged() {
  preservation.remove_at([1, 2, 3], 3) == [1, 2, 3]
}

test remove_at_negative_index_returns_list_unchanged() {
  preservation.remove_at([1, 2, 3], -1) == [1, 2, 3]
}
