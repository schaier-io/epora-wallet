use aiken/collection/list
use aiken/fuzz
use aiken/interval
use cardano/address.{Address, VerificationKey}
use state/configuration as state_configuration
use state/proof_of_life
use state/types as state_types
use state/types.{Beneficiary, State, User}
use streaming_payments/types as streaming_payment_types

fn mk_user(id: Int, is_admin: Bool, can_renew_proof_of_life: Bool) -> User {
  User {
    id,
    user_wallets: ["user"],
    per_day_allowance: [],
    remaining_allowance: [],
    next_allowance_reset: 0,
    can_renew_proof_of_life,
    multi_sig_power: None,
    is_admin,
  }
}

fn mk_beneficiary(id: Int) -> Beneficiary {
  Beneficiary {
    id,
    beneficiary_wallets: ["beneficiary"],
    unlock_after: Some(100),
    weight: 1,
  }
}

fn mk_streaming_payment(id: Int) -> streaming_payment_types.StreamingPayment {
  streaming_payment_types.StreamingPayment {
    id,
    payout_address: Address {
      payment_credential: VerificationKey(
        #"86d69f3105b5afa6c70c1fc271724d79340e11f2c4521863a297eab2",
      ),
      stake_credential: None,
    },
    paid_out_amount: 0,
    policy_id: #"",
    asset_name: #"",
    amount_per_day: 100,
    start_date: 0,
    end_date: 200,
  }
}

fn mk_state(
  users: List<User>,
  multi_sig_threshold: Option<Int>,
  beneficiaries: List<Beneficiary>,
  proof_of_life_unlock_time: Option<Int>,
  proof_of_life_increment: Option<Int>,
  streaming_payments: List<streaming_payment_types.StreamingPayment>,
) -> State {
  State {
    access: state_types.AccessControl {
      users,
      multi_sig_threshold,
      beneficiaries,
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: proof_of_life_unlock_time,
      increment: proof_of_life_increment,
    },
    wallet_name: #"",
    streaming_payments,
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
}

// cf.ben_weight — every beneficiary weight must be >= 1 (a zero/negative weight
// would lock its proportional share of the recovery pool forever). The admin
// keeps the config otherwise reachable, isolating the weight check.
test valid_state_configuration_rejects_zero_weight_beneficiary() fail {
  let zero_weight_beneficiary = Beneficiary {
    id: 1,
    beneficiary_wallets: ["beneficiary"],
    unlock_after: Some(100),
    weight: 0,
  }
  state_configuration.expect_valid_state_configuration(
    mk_state(
      [mk_user(0, True, False)],
      None,
      [zero_weight_beneficiary],
      Some(100),
      Some(50),
      [],
    ),
  )
}

test state_unchanged_except_streaming_payments_succeeds() {
  let state_1 = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    None,
    None,
    [mk_streaming_payment(0)],
  )
  let state_2 = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    None,
    None,
    [mk_streaming_payment(1)],
  )

  expect and {
      state_1.access == state_2.access,
      state_1.proof_of_life == state_2.proof_of_life,
      state_1.wallet_name == state_2.wallet_name,
    }
}

test state_unchanged_except_streaming_payments_fails_when_users_change() fail {
  let state_1 = mk_state([mk_user(0, True, True)], None, [], None, None, [])
  let state_2 = mk_state([mk_user(1, True, True)], None, [], None, None, [])

  expect and {
      state_1.access == state_2.access,
      state_1.proof_of_life == state_2.proof_of_life,
      state_1.wallet_name == state_2.wallet_name,
    }
}

test state_unchanged_except_proof_of_life_unlock_time_succeeds() {
  let state_1 = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let state_2 = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    Some(150),
    Some(50),
    [],
  )

  expect and {
      state_1.access == state_2.access,
      state_1.proof_of_life.increment == state_2.proof_of_life.increment,
      state_1.streaming_payments == state_2.streaming_payments,
      state_1.wallet_name == state_2.wallet_name,
    }
}

test valid_state_configuration_rejects_beneficiaries_without_proof_of_life() fail {
  state_configuration.expect_valid_state_configuration(
    mk_state(
      [mk_user(0, True, True)],
      None,
      [mk_beneficiary(0)],
      None,
      None,
      [],
    ),
  )
}

test valid_state_configuration_accepts_zero_admin_state_with_reachable_beneficiary() {
  state_configuration.expect_valid_state_configuration(
    mk_state(
      [mk_user(0, False, False)],
      None,
      [mk_beneficiary(0)],
      Some(100),
      Some(50),
      [],
    ),
  )
}

// Full lock rejected: no admin, no multisig, and the only beneficiary has no
// signable wallet — no path can ever act.
test valid_state_configuration_rejects_zero_admin_without_signable_path() fail {
  let no_wallet_beneficiary = Beneficiary {
    id: 0,
    beneficiary_wallets: [],
    unlock_after: Some(100),
    weight: 1,
  }
  state_configuration.expect_valid_state_configuration(
    mk_state(
      [mk_user(0, False, False)],
      None,
      [no_wallet_beneficiary],
      Some(100),
      Some(50),
      [],
    ),
  )
}

// Distant-but-finite unlock accepted: recovery reachability is a shape check,
// not a timing one — a far-future unlock_after is still reachable (the off-chain
// layer warns about it; the contract does not reject it).
test valid_state_configuration_accepts_distant_beneficiary_unlock_after() {
  let distant_beneficiary = Beneficiary {
    id: 0,
    beneficiary_wallets: ["user"],
    unlock_after: Some(9_999_999_999_999),
    weight: 1,
  }
  state_configuration.expect_valid_state_configuration(
    mk_state(
      [mk_user(0, False, False)],
      None,
      [distant_beneficiary],
      Some(100),
      Some(50),
      [],
    ),
  )
}

// A wallet-less beneficiary is rejected outright — even when an admin (or any
// other recovery path) exists. Under the weighted-share model its weight dilutes
// the signable beneficiaries' shares yet it can never sign to withdraw, so its
// portion of the pool would be permanently locked. Requiring a wallet on every
// beneficiary keeps the collective-sweep guarantee intact (regression for the
// "weighted-share recovery can lock funds despite passing reachability" gap).
test valid_state_configuration_rejects_beneficiary_without_wallet() fail {
  let wallet_less_beneficiary = Beneficiary {
    id: 1,
    beneficiary_wallets: [],
    unlock_after: Some(100),
    weight: 99,
  }
  let signable_beneficiary = Beneficiary {
    id: 2,
    beneficiary_wallets: ["beneficiary"],
    unlock_after: Some(100),
    weight: 1,
  }
  state_configuration.expect_valid_state_configuration(
    mk_state(
      [mk_user(0, True, False)],
      None,
      [wallet_less_beneficiary, signable_beneficiary],
      Some(100),
      Some(50),
      [],
    ),
  )
}

test valid_state_configuration_allows_beneficiary_user_wallet_overlap() {
  let overlapping_user = User {
    id: 0,
    user_wallets: ["shared"],
    per_day_allowance: [],
    remaining_allowance: [],
    next_allowance_reset: 0,
    can_renew_proof_of_life: False,
    multi_sig_power: None,
    is_admin: False,
  }
  let overlapping_beneficiary = Beneficiary {
    id: 0,
    beneficiary_wallets: ["shared"],
    unlock_after: Some(100),
    weight: 1,
  }

  state_configuration.expect_valid_state_configuration(
    mk_state(
      [overlapping_user],
      None,
      [overlapping_beneficiary],
      Some(100),
      Some(50),
      [],
    ),
  )
}

// ===========================================================================
// Property-based coverage for the access primitives.
//
// The cases above pin specific configurations; the `prop_*` tests assert the
// consensus-critical arithmetic (the weighted multisig sum and the
// proof-of-life windows) holds over random inputs.
// ===========================================================================

// A user carrying a fixed multisig power and a signable wallet.
fn mk_signer(id: Int, power: Int) -> User {
  User {
    id,
    user_wallets: ["w"],
    per_day_allowance: [],
    remaining_allowance: [],
    next_allowance_reset: 0,
    can_renew_proof_of_life: False,
    multi_sig_power: Some(power),
    is_admin: False,
  }
}

fn signers_from_powers(powers: List<Int>) -> List<User> {
  list.indexed_map(powers, fn(index, power) { mk_signer(index, power) })
}

// The summed power the validator actually counts: positive powers only.
fn total_positive_power(powers: List<Int>) -> Int {
  list.foldl(
    powers,
    0,
    fn(power, acc) {
      if power > 0 {
        acc + power
      } else {
        acc
      }
    },
  )
}

fn counts_all(_user: User) -> Bool {
  True
}

// A `None` threshold is never met — an unconfigured multisig grants no power.
test prop_multisig_none_threshold_never_met(powers via fuzz.list(fuzz.int())) {
  !state_configuration.multisig_threshold_is_met(
    signers_from_powers(powers),
    None,
    counts_all,
  )
}

// A zero or negative threshold is never met: a quorum must require real power.
test prop_multisig_nonpositive_threshold_never_met(
  args via fuzz.both(fuzz.list(fuzz.int()), fuzz.int_at_most(0)),
) {
  let (powers, threshold) = args
  !state_configuration.multisig_threshold_is_met(
    signers_from_powers(powers),
    Some(threshold),
    counts_all,
  )
}

// The quorum is met exactly up to the total available power: it holds at the
// total itself (when positive) and fails one unit beyond it.
test prop_multisig_met_up_to_total_power(
  args via fuzz.both(fuzz.list(fuzz.int()), fuzz.int_at_least(1)),
) {
  let (powers, overshoot) = args
  let users = signers_from_powers(powers)
  let total = total_positive_power(powers)
  and {
    when total >= 1 is {
      True ->
        state_configuration.multisig_threshold_is_met(
          users,
          Some(total),
          counts_all,
        )
      False -> True
    },
    !state_configuration.multisig_threshold_is_met(
      users,
      Some(total + overshoot),
      counts_all,
    ),
  }
}

// Counting more signers can only help: if a restrictive predicate reaches the
// threshold, the permissive (count-everyone) predicate must reach it too.
test prop_multisig_predicate_is_monotone(
  args via fuzz.both(
    fuzz.both(fuzz.list(fuzz.int()), fuzz.int_at_least(1)),
    fuzz.int(),
  ),
) {
  let ((powers, threshold), cutoff) = args
  let users = signers_from_powers(powers)
  let restrictive = state_configuration.multisig_threshold_is_met(
    users,
    Some(threshold),
    fn(user) { user.id <= cutoff },
  )
  let permissive = state_configuration.multisig_threshold_is_met(
    users,
    Some(threshold),
    counts_all,
  )
  !restrictive || permissive
}

// Beneficiary unlock is reached precisely when the tx's earliest time has met
// the unlock time (`<=` boundary).
test prop_unlock_reached_matches_boundary(
  args via fuzz.both(fuzz.int(), fuzz.int()),
) {
  let (earliest, unlock) = args
  let validity_range = interval.after(earliest)
  proof_of_life.is_unlock_time_reached(validity_range, Some(unlock)) == (
    unlock <= earliest
  )
}

// With proof-of-life unconfigured (no unlock time) the unlock is never reached.
test prop_unlock_never_reached_without_unlock_time(earliest via fuzz.int()) {
  !proof_of_life.is_unlock_time_reached(interval.after(earliest), None)
}

// A renewal is accepted exactly when the new unlock time lands within the
// window the bounds frame: at or after the latest bound, at most one increment
// past the earliest bound, and never earlier than the previous unlock. An
// unchanged unlock time is trivially accepted (no renewal happened).
test prop_renewal_window_matches_bounds(
  args via fuzz.both(
    fuzz.both(fuzz.int(), fuzz.int()),
    fuzz.both(
      fuzz.int_at_least(1),
      fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
    ),
  ),
) {
  let ((earliest, latest), (increment, (previous_unlock, updated_unlock))) = args
  let input = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    Some(previous_unlock),
    Some(increment),
    [],
  )
  let output = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    Some(updated_unlock),
    Some(increment),
    [],
  )
  let validity_range = interval.between(earliest, latest)
  let expected = if updated_unlock == previous_unlock {
    True
  } else {
    and {
      updated_unlock >= latest,
      updated_unlock <= earliest + increment,
      updated_unlock >= previous_unlock,
    }
  }
  proof_of_life.has_valid_renewal_window(validity_range, input, output) == expected
}

// The dead-man-switch ceiling: a renewal that pushes the unlock time more than
// one increment past the earliest bound is always rejected, however wide the
// window. (latest is pinned to earliest so only the ceiling rule can fail.)
test prop_renewal_beyond_one_increment_rejected(
  args via fuzz.both(
    fuzz.both(fuzz.int(), fuzz.int_at_least(1)),
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(1)),
  ),
) {
  let ((earliest, increment), (previous_unlock, overshoot)) = args
  let updated_unlock = earliest + increment + overshoot
  let input = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    Some(previous_unlock),
    Some(increment),
    [],
  )
  let output = mk_state(
    [mk_user(0, True, True)],
    None,
    [],
    Some(updated_unlock),
    Some(increment),
    [],
  )
  let validity_range = interval.between(earliest, earliest)
  if updated_unlock == previous_unlock {
    True
  } else {
    !proof_of_life.has_valid_renewal_window(validity_range, input, output)
  }
}
