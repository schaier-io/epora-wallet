//// Allowance velocity arithmetic: how a user's per-day allowance resets over
//// time and how an allowance-use transition is validated and its spent delta
//// extracted (`expect_allowance_updates` — consumed by
//// `lib/stt/user_handlers.ak::eval_use_allowance`, whose declared payload the
//// wallet validator then bounds against).
////
//// The rounding- and boundary-sensitive reset helpers are private and covered
//// by the co-located property tests at the bottom of this file (the sanctioned
//// test co-location — see the contracts CLAUDE.md).

use aiken/collection/list
use aiken/fuzz
use assets/entries as asset_entries
use cardano/assets.{quantity_of}
use constants
use state/types.{AllowanceUpdate, AssetEntries, EffectiveAllowance, User}

// Derive the allowance state that should apply at the current transaction time.
//
// Two bounds are required because they protect against opposite abuses:
//   - `tx_earliest_time` (lower bound) gates whether the per-day allowance is
//     considered reset. Using the earliest possible time prevents a user from
//     forging an "already reset" view by extending their tx upper bound into
//     the future (which the slot leader would otherwise still admit).
//   - `tx_latest_time` (upper bound) drives `next_allowance_reset_after_use`
//     so that the new reset deadline lands at least one full period past the
//     latest slot at which this tx could land — ensuring forward progress.
fn effective_allowance(
  user: User,
  tx_earliest_time: Int,
  tx_latest_time: Int,
) -> EffectiveAllowance {
  EffectiveAllowance {
    remaining_allowance: remaining_allowance_available_for_use(
      user,
      tx_earliest_time,
    ),
    next_allowance_reset_after_use: next_allowance_reset_after_use(
      user.next_allowance_reset,
      tx_latest_time,
    ),
  }
}

/// Walk the input/output user lists in lockstep and collect the allowance
/// updates that differ from the input state.
///
/// Invariants enforced via `expect` along the recursion (failure of either
/// fails the transaction):
///   - `users_input` and `users_output` have the same length and same order
///     (users may not be inserted or removed in an allowance-use action).
///   - For each user where the records differ, the change is a valid
///     allowance-only update (static fields preserved, remaining_allowance
///     respects the available window, next_allowance_reset is rebased
///     correctly).
///
/// Returns the list of users that actually changed, each annotated with the
/// `spent_allowance` delta the wallet validator must enforce as the bound on
/// `paid_out_value`.
pub fn expect_allowance_updates(
  users_input: List<User>,
  users_output: List<User>,
  tx_earliest_time: Int,
  tx_latest_time: Int,
) -> List<AllowanceUpdate> {
  // Lockstep walk: an allowance-use may not insert or remove users, so the two
  // lists must align position-for-position — the length check enforces that.
  // Each position whose record changed yields one validated `AllowanceUpdate`
  // (unchanged users are skipped). `foldr` + prepend preserves input order.
  expect list.length(users_input) == list.length(users_output)
  list.foldr(
    list.zip(users_input, users_output),
    [],
    fn(user_pair, updates) {
      let (user_input, user_output) = user_pair
      if user_input == user_output {
        updates
      } else {
        let update = expect_allowance_update(
          user_input,
          user_output,
          tx_earliest_time,
          tx_latest_time,
        )
        [update, ..updates]
      }
    },
  )
}

// Validate a changed user and extract the allowance delta it spent.
fn expect_allowance_update(
  old_user: User,
  new_user: User,
  tx_earliest_time: Int,
  tx_latest_time: Int,
) -> AllowanceUpdate {
  expect user_static_fields_are_equal(old_user, new_user)

  let  
      EffectiveAllowance {
        remaining_allowance: effective_remaining_allowance,
        next_allowance_reset_after_use,
      }
    = effective_allowance(old_user, tx_earliest_time, tx_latest_time)
  let effective_remaining_allowance_value = asset_entries.value_from_asset_entries(
    effective_remaining_allowance,
  )
  let new_remaining_allowance_value = asset_entries.value_from_asset_entries(
    new_user.remaining_allowance,
  )

  let next_reset_rebased_correctly = new_user.next_allowance_reset == next_allowance_reset_after_use
  // Allowance values are tracked as multi-assets, but every quantity must remain non-negative.
  let old_allowance_nonnegative = list.all(
    effective_remaining_allowance,
    fn(asset) { asset.quantity >= 0 },
  )
  // The post-spend remaining allowance must be a well-formed bundle: every
  // quantity non-negative AND no duplicate (policy_id, asset_name) key. The
  // duplicate-key guard is the important addition over a plain non-negativity
  // check: `value_from_asset_entries` (used above, and by the spent-delta math)
  // SUMS duplicate entries, so without it a list like `[(ada,8),(ada,8)]` would
  // pass the per-entry `<= effective` bound while representing 16 — a stored
  // remaining that disagrees with its own value. Same `assets/entries` check the
  // config path runs, so a once-valid bundle stays valid across updates.
  let new_allowance_valid = asset_entries.entries_are_valid(
    new_user.remaining_allowance,
  )

  expect next_reset_rebased_correctly
  expect old_allowance_nonnegative
  expect new_allowance_valid
  // Bound the entry count on the spend path too: config validation caps
  // `remaining_allowance` at mint/`UpdateState`, but `UseAllowance` does not
  // re-run it, so without this a spend could pad the bundle with extra (e.g.
  // zero-quantity) entries and grow the per-tx scan cost unbounded (audit A1).
  expect
    list.length(new_user.remaining_allowance) <= constants.max_allowance_entries
  expect
    remaining_allowance_transition_is_valid(
      effective_remaining_allowance_value,
      new_user.remaining_allowance,
    )

  let spent_allowance = assets.merge(
    effective_remaining_allowance_value,
    assets.negate(new_remaining_allowance_value),
  )
    |> asset_entries.flatten_to_entries

  expect list.length(spent_allowance) > 0
  AllowanceUpdate {
    changed_user_wallets: old_user.user_wallets,
    spent_allowance,
  }
}

// These user fields must stay unchanged across an allowance-only update.
fn user_static_fields_are_equal(old_user: User, new_user: User) -> Bool {
  and {
    (old_user.id == new_user.id)?,
    (old_user.user_wallets == new_user.user_wallets)?,
    (old_user.per_day_allowance == new_user.per_day_allowance)?,
    (old_user.can_renew_proof_of_life == new_user.can_renew_proof_of_life)?,
    (old_user.multi_sig_power == new_user.multi_sig_power)?,
    (old_user.is_admin == new_user.is_admin)?,
  }
}

/// Reset expired allowances before comparing the remaining balance after a
/// spend.
///
/// Bound choice: `tx_earliest_time` (lower bound) is required, not
/// `tx_latest_time`. If the upper bound were used, a user could submit a tx
/// at the current slot with an arbitrarily distant `validUntil` and have
/// the validator treat the daily allowance as already reset — defeating
/// the per-day velocity cap (one calendar day's worth of allowance could
/// be drained in a single tx, then again, by chaining tx upper bounds).
/// Using the lower bound forces a real-time check: the reset only counts
/// once the slot leader could not possibly admit this tx before the reset
/// deadline.
///
/// Boundary semantics: `<=` is intentional — at the exact slot
/// `tx_earliest_time == next_allowance_reset` the allowance is considered
/// expired and reset to `per_day_allowance`. A `<` would force the user to
/// wait one extra slot past their own reset time.
fn remaining_allowance_available_for_use(
  user: User,
  tx_earliest_time: Int,
) -> AssetEntries {
  if user.next_allowance_reset <= tx_earliest_time {
    user.per_day_allowance
  } else {
    user.remaining_allowance
  }
}

// Remaining allowance may only keep or reduce quantities for assets that already existed.
fn remaining_allowance_transition_is_valid(
  remaining_allowance_before_use: assets.Value,
  remaining_allowance_after_use: AssetEntries,
) -> Bool {
  list.all(
    remaining_allowance_after_use,
    fn(asset) {
      and {
        (asset.quantity >= 0)?,
        (asset.quantity <= quantity_of(
          remaining_allowance_before_use,
          asset.policy_id,
          asset.asset_name,
        ))?,
      }
    },
  )
}

// Move the next reset time forward by at least one allowance period.
fn next_allowance_reset_after_use(
  current_next_allowance_reset: Int,
  tx_latest_time: Int,
) -> Int {
  let minimum_next_allowance_reset = tx_latest_time + constants.milliseconds_per_day

  if current_next_allowance_reset > minimum_next_allowance_reset {
    current_next_allowance_reset
  } else {
    minimum_next_allowance_reset
  }
}

// ===========================================================================
// Property-based coverage for the allowance velocity arithmetic. These exercise
// the private reset helpers directly, since they are the rounding- and
// boundary-sensitive core the spend-time checks lean on.
// ===========================================================================

// Build a user whose allowance fields are the only thing the reset helpers read.
fn mk_allowance_user(
  next_allowance_reset: Int,
  per_day_allowance: AssetEntries,
  remaining_allowance: AssetEntries,
) -> User {
  User {
    id: 0,
    user_wallets: ["w"],
    per_day_allowance,
    remaining_allowance,
    next_allowance_reset,
    can_renew_proof_of_life: False,
    multi_sig_power: None,
    is_admin: False,
  }
}

// The new reset deadline always lands at least one full day past the tx's latest
// bound (forward progress) and never moves earlier than the current deadline.
test prop_next_reset_advances_at_least_one_period(
  args via fuzz.both(fuzz.int(), fuzz.int()),
) {
  let (current_next_allowance_reset, tx_latest_time) = args
  let result = next_allowance_reset_after_use(
    current_next_allowance_reset,
    tx_latest_time,
  )
  and {
    result >= tx_latest_time + constants.milliseconds_per_day,
    result >= current_next_allowance_reset,
  }
}

// The allowance is treated as reset (full per-day budget available) exactly when
// the tx's earliest bound has reached the deadline; before that, the stored
// remaining allowance stands. The lower bound is used so a wide validity window
// cannot fake an early reset.
test prop_allowance_resets_at_or_after_deadline(
  args via fuzz.both(fuzz.int(), fuzz.int()),
) {
  let (next_allowance_reset, tx_earliest_time) = args
  let user = mk_allowance_user(
    next_allowance_reset,
    [asset_entries.asset_entry(#"", #"", 7)],
    [asset_entries.asset_entry(#"", #"", 3)],
  )
  let available = remaining_allowance_available_for_use(user, tx_earliest_time)
  if next_allowance_reset <= tx_earliest_time {
    available == user.per_day_allowance
  } else {
    available == user.remaining_allowance
  }
}
