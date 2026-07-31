//// State-datum shapes for the test suites: one baseline record per type plus
//// `with_*` mutators that layer a single concern onto it. Split out of
//// `test_support/security_fixtures`, which now owns only transaction / input /
//// output construction and the `SttAction` shortcuts — two distinct audit
//// concerns, two modules (CLAUDE.md §1).
////
//// Everything is built by RECORD UPDATE over a `base_*` value rather than by a
//// positional constructor. That is deliberate: `user(0, ["admin"], [], [], 0,
//// False, None, True)` hid which flag was `can_renew_proof_of_life` and which
//// was `is_admin`, and every added field forced an edit at every call site. A
//// test now names exactly the fields it puts under attack and inherits the
//// rest, so a new `State` field is a one-line change here.
////
//// Everything here is plain data construction — none of it touches a validator
//// (lib modules must not import a validator).

use assets/entries as asset_entries
use cardano/address.{Address}
use cardano/assets
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use test_support/security_fixtures as fixtures

// ---------------------------------------------------------------------------
// Baseline records — the zero-authority, zero-schedule starting points.
// ---------------------------------------------------------------------------

/// The weakest possible access entry: id 0, no wallets, no admin flag, no
/// multisig power, no allowance, no renewal right. Bare membership of
/// `access.users` and nothing else.
pub fn base_user() -> state_types.User {
  state_types.User {
    id: 0,
    user_wallets: [],
    per_day_allowance: [],
    remaining_allowance: [],
    next_allowance_reset: 0,
    can_renew_proof_of_life: False,
    multi_sig_power: None,
    is_admin: False,
  }
}

/// A weight-1 beneficiary with no wallets and no unlock deadline.
pub fn base_beneficiary() -> state_types.Beneficiary {
  state_types.Beneficiary {
    id: 0,
    beneficiary_wallets: [],
    unlock_after: None,
    weight: 1,
  }
}

/// The canonical ADA schedule: 1_000_000 lovelace/day from day 0, nothing paid
/// out yet, no payee. `policy_id`/`asset_name` empty = ADA.
pub fn base_streaming_payment() -> StreamingPayment {
  StreamingPayment {
    id: 0,
    payout_address: fixtures.address_from_key(#""),
    paid_out_amount: 0,
    policy_id: #"",
    asset_name: #"",
    amount_per_day: 1_000_000,
    start_date: 0,
    end_date: 259_200_000,
  }
}

/// An empty wallet: no users, no beneficiaries, no multisig, no proof-of-life
/// schedule, no streaming payments, no pinned stake credential, never cranked.
pub fn base_state() -> state_types.State {
  state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_non_admin_payout_at: None,
  }
}

// ---------------------------------------------------------------------------
// State mutators — each layers exactly one concern, so a test reads as the
// list of things it turned on.
// ---------------------------------------------------------------------------

pub fn with_users(
  state: state_types.State,
  users: List<state_types.User>,
) -> state_types.State {
  state_types.State {
    ..state,
    access: state_types.AccessControl { ..state.access, users },
  }
}

pub fn with_beneficiaries(
  state: state_types.State,
  beneficiaries: List<state_types.Beneficiary>,
) -> state_types.State {
  state_types.State {
    ..state,
    access: state_types.AccessControl { ..state.access, beneficiaries },
  }
}

/// Arm weighted multisig at `threshold`. Power itself lives per-user
/// (`multi_sig_power`); this is only the quorum the summed power must reach.
pub fn with_multisig_threshold(
  state: state_types.State,
  threshold: Int,
) -> state_types.State {
  state_types.State {
    ..state,
    access: state_types.AccessControl {
      ..state.access,
      multi_sig_threshold: Some(threshold),
    },
  }
}

/// Arm the dead-man-switch: beneficiaries unlock at `unlock_time`, and a
/// renewal may push that forward by at most `increment`. Both fields are set
/// together — `proof_of_life.expect_valid_settings` rejects a half-set pair.
pub fn with_proof_of_life(
  state: state_types.State,
  unlock_time: Int,
  increment: Int,
) -> state_types.State {
  state_types.State {
    ..state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(unlock_time),
      increment: Some(increment),
    },
  }
}

/// `state` with `proof_of_life.unlock_time` renewed to `unlock_time`. The
/// increment is preserved — a renewal moves the deadline, never the schedule.
pub fn with_renewed_proof_of_life(
  state: state_types.State,
  unlock_time: Int,
) -> state_types.State {
  state_types.State {
    ..state,
    proof_of_life: state_types.ProofOfLifeSettings {
      ..state.proof_of_life,
      unlock_time: Some(unlock_time),
    },
  }
}

pub fn with_streaming_payments(
  state: state_types.State,
  streaming_payments: List<StreamingPayment>,
) -> state_types.State {
  state_types.State { ..state, streaming_payments }
}

// ---------------------------------------------------------------------------
// Named roles — the access entries the suites reach for by name.
// ---------------------------------------------------------------------------

pub fn admin_user(wallet: ByteArray) -> state_types.User {
  state_types.User {
    ..base_user(),
    user_wallets: [fixtures.key_hash(wallet)],
    is_admin: True,
  }
}

pub fn renewing_user(id: Int, wallet: ByteArray) -> state_types.User {
  state_types.User {
    ..base_user(),
    id,
    user_wallets: [fixtures.key_hash(wallet)],
    can_renew_proof_of_life: True,
  }
}

/// A listed user with NO admin flag, NO multisig power, NO allowance and NO
/// renewal right. Exists so a test can pin that bare membership of
/// `access.users` is enough authority (the crank's user arm) without
/// accidentally leaning on one of the other rights.
pub fn plain_user(id: Int, wallet: ByteArray) -> state_types.User {
  state_types.User {
    ..base_user(),
    id,
    user_wallets: [fixtures.key_hash(wallet)],
  }
}

pub fn multisig_user(id: Int, wallet: ByteArray, power: Int) -> state_types.User {
  state_types.User {
    ..base_user(),
    id,
    user_wallets: [fixtures.key_hash(wallet)],
    multi_sig_power: Some(power),
  }
}

/// 1_000_000-lovelace-per-day allowance user. Callers pick remaining_allowance
/// (lovelace) and next_allowance_reset (POSIX ms) so tests can express both
/// "fresh" and "partially-spent / reset-shifted" states.
pub fn allowance_user(
  id: Int,
  wallet: ByteArray,
  remaining_allowance: Int,
  next_allowance_reset: Int,
  can_renew_proof_of_life: Bool,
) -> state_types.User {
  state_types.User {
    ..base_user(),
    id,
    user_wallets: [fixtures.key_hash(wallet)],
    per_day_allowance: assets.from_lovelace(1_000_000)
      |> asset_entries.flatten_to_entries,
    remaining_allowance: assets.from_lovelace(remaining_allowance)
      |> asset_entries.flatten_to_entries,
    next_allowance_reset,
    can_renew_proof_of_life,
  }
}

/// Single-wallet, weight-1 beneficiary — what most tests want.
pub fn default_beneficiary(
  id: Int,
  wallet: ByteArray,
  unlock_after: Option<Int>,
) -> state_types.Beneficiary {
  state_types.Beneficiary {
    ..base_beneficiary(),
    id,
    beneficiary_wallets: [fixtures.key_hash(wallet)],
    unlock_after,
  }
}

// ---------------------------------------------------------------------------
// Named wallet shapes — the whole-State starting points.
// ---------------------------------------------------------------------------

/// A 2-of-N state with a 100/50 proof-of-life schedule. Used by most STT
/// transition-rule tests.
pub fn secured_state(
  users: List<state_types.User>,
  beneficiaries: List<state_types.Beneficiary>,
  streaming_payments: List<StreamingPayment>,
) -> state_types.State {
  base_state()
    |> with_users(users)
    |> with_beneficiaries(beneficiaries)
    |> with_multisig_threshold(2)
    |> with_proof_of_life(100, 50)
    |> with_streaming_payments(streaming_payments)
}

/// A single-admin state (admin key "admin", 100/50 proof-of-life schedule, no
/// multisig / beneficiaries / streaming payments) — the canonical baseline for
/// STT mint/spend tests.
pub fn admin_state() -> state_types.State {
  base_state()
    |> with_users([admin_user("admin")])
    |> with_proof_of_life(100, 50)
}

/// The canonical ADA streaming payment: 1_000_000 lovelace/day from day 0
/// through day 3, payable to the key-hash address `payee_key`.
pub fn ada_streaming_payment(
  id: Int,
  payee_key: ByteArray,
  paid_out: Int,
) -> StreamingPayment {
  StreamingPayment {
    ..base_streaming_payment(),
    id,
    payout_address: fixtures.address_from_key(payee_key),
    paid_out_amount: paid_out,
  }
}

/// `ada_streaming_payment` with a chosen end date, for schedule-boundary tests
/// (matured removal, rescheduled stop).
pub fn ada_streaming_payment_ending(
  id: Int,
  payee_key: ByteArray,
  paid_out: Int,
  end_date: Int,
) -> StreamingPayment {
  StreamingPayment {
    ..ada_streaming_payment(id, payee_key, paid_out),
    end_date,
  }
}

/// A single-admin state with one streaming payment paid `streaming_payment_paid`
/// of its 1_000_000/day to "beneficiary1". The wallet streaming-payment payout
/// tests use this as the canonical input/output state.
pub fn streaming_payment_payout_state(
  streaming_payment_paid: Int,
) -> state_types.State {
  admin_state()
    |> with_streaming_payments(
        [ada_streaming_payment(1, "beneficiary1", streaming_payment_paid)],
      )
}

/// Two-payment variant: payment 1 to "beneficiary1" with
/// `first_streaming_payment_paid`, payment 2 to "beneficiary2" with 0 paid.
/// Used by tests that probe payout-routing rules across multiple payees.
pub fn two_streaming_payment_payout_state(
  first_streaming_payment_paid: Int,
) -> state_types.State {
  admin_state()
    |> with_streaming_payments(
        [
          ada_streaming_payment(1, "beneficiary1", first_streaming_payment_paid),
          ada_streaming_payment(2, "beneficiary2", 0),
        ],
      )
}

/// A `StreamingPayment` addressed to an arbitrary `Address` rather than a bare
/// key hash — for payout-routing tests that target a script address.
pub fn streaming_payment_to(
  id: Int,
  payout_address: Address,
  paid_out: Int,
) -> StreamingPayment {
  StreamingPayment {
    ..base_streaming_payment(),
    id,
    payout_address,
    paid_out_amount: paid_out,
  }
}
