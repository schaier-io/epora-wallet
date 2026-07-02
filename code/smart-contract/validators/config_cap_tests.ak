//// Regression tests for the access/streaming list-size caps
//// (`constants.max_users` / `max_beneficiaries` / `max_streaming_payments`).
//// These bound the per-transaction execution cost so a wallet cannot be grown
//// past the budget and stranded. Mint and every `UpdateState` run
//// `expect_valid_state_configuration`; streaming payments are capped at mint
//// via `expect_valid`.

use aiken/primitive/bytearray.{from_int_big_endian}
use assets/entries as asset_entries
use state/configuration as state_configuration
use state/types as state_types
use streaming_payments/shape as streaming_payment_shape
use streaming_payments/types.{StreamingPayment}
use test_support/security_fixtures as fixtures

// `count` SIGNABLE admin users with unique ids and empty allowances. Each
// carries a wallet key so the recovery-reachability check is trivially
// satisfied (a wallet-less admin is not a reachable path), isolating the count
// cap. Wallets may overlap across users, so one shared key is fine.
fn make_users(count: Int) -> List<state_types.User> {
  make_users_from(1, count)
}

fn make_users_from(next_id: Int, remaining: Int) -> List<state_types.User> {
  if remaining <= 0 {
    []
  } else {
    [
      fixtures.user(next_id, ["admin"], [], [], 0, False, None, True),
      ..make_users_from(next_id + 1, remaining - 1)
    ]
  }
}

// `count` beneficiaries, each with a unique single wallet (so the pairwise
// distinctness check is satisfied at the cap) and weight 1.
fn make_beneficiaries(count: Int) -> List<state_types.Beneficiary> {
  make_beneficiaries_from(1, count)
}

fn make_beneficiaries_from(
  next_id: Int,
  remaining: Int,
) -> List<state_types.Beneficiary> {
  if remaining <= 0 {
    []
  } else {
    [
      fixtures.beneficiary(
        next_id,
        [from_int_big_endian(next_id, 8)],
        Some(100),
        1,
      ),
      ..make_beneficiaries_from(next_id + 1, remaining - 1)
    ]
  }
}

// `count` well-formed streaming payments with unique ids (paid_out 0, 3-day
// window) sharing one payee address.
fn make_streaming(count: Int) -> List<StreamingPayment> {
  make_streaming_from(1, count)
}

fn make_streaming_from(next_id: Int, remaining: Int) -> List<StreamingPayment> {
  if remaining <= 0 {
    []
  } else {
    [
      fixtures.streaming_payment(
        next_id,
        fixtures.address_from_key("payee"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
      ..make_streaming_from(next_id + 1, remaining - 1)
    ]
  }
}

// --- accepts exactly at the cap -------------------------------------------

test config_accepts_max_users() {
  expect
    state_configuration.expect_valid_state_configuration(
      fixtures.state(make_users(15), None, [], None, None, []),
    )
}

test config_accepts_max_beneficiaries() {
  expect
    state_configuration.expect_valid_state_configuration(
      fixtures.state(
        [fixtures.admin_user("admin")],
        None,
        make_beneficiaries(25),
        Some(100),
        Some(50),
        [],
      ),
    )
}

test config_accepts_max_streaming_payments() {
  expect streaming_payment_shape.expect_valid(make_streaming(25))
}

// --- rejects one over the cap ---------------------------------------------

test config_rejects_too_many_users() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      fixtures.state(make_users(16), None, [], None, None, []),
    )
}

test config_rejects_too_many_beneficiaries() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      fixtures.state(
        [fixtures.admin_user("admin")],
        None,
        make_beneficiaries(26),
        Some(100),
        Some(50),
        [],
      ),
    )
}

test config_rejects_too_many_streaming_payments() fail {
  expect streaming_payment_shape.expect_valid(make_streaming(26))
}

// --- inner-collection caps (audit A1) -------------------------------------
//
// The record-count caps above bound the OUTER lists; these bound the INNER
// collections those records carry (per-user wallets/allowance, per-beneficiary
// wallets, wallet_name) so a privileged `UpdateState`/mint cannot commit a
// datum that later transitions can no longer afford to decode. Caps:
// max_wallets_per_user=10, max_allowance_entries=10, max_beneficiary_wallets=10,
// max_wallet_name_bytes=32.

// `count` distinct payment-key hashes.
fn make_wallets(count: Int) -> List<ByteArray> {
  make_wallets_from(1, count)
}

fn make_wallets_from(next: Int, remaining: Int) -> List<ByteArray> {
  if remaining <= 0 {
    []
  } else {
    [from_int_big_endian(next, 8), ..make_wallets_from(next + 1, remaining - 1)]
  }
}

// `count` distinct, well-formed allowance entries (unique asset names, qty 1).
fn make_allowance_entries(count: Int) -> state_types.AssetEntries {
  make_allowance_entries_from(1, count)
}

fn make_allowance_entries_from(
  next: Int,
  remaining: Int,
) -> state_types.AssetEntries {
  if remaining <= 0 {
    []
  } else {
    [
      asset_entries.asset_entry(#"", from_int_big_endian(next, 4), 1),
      ..make_allowance_entries_from(next + 1, remaining - 1)
    ]
  }
}

// An admin user (keeps reachability trivial) carrying the given inner lists.
fn admin_user_with(
  wallets: List<ByteArray>,
  per_day: state_types.AssetEntries,
  remaining: state_types.AssetEntries,
) -> state_types.User {
  fixtures.user(0, wallets, per_day, remaining, 0, False, None, True)
}

fn admin_state_with_user(user: state_types.User) -> state_types.State {
  fixtures.state([user], None, [], None, None, [])
}

// user_wallets

test config_accepts_max_wallets_per_user() {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(admin_user_with(make_wallets(10), [], [])),
    )
}

test config_rejects_too_many_wallets_per_user() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(admin_user_with(make_wallets(11), [], [])),
    )
}

// allowance entries (per_day_allowance and remaining_allowance both capped)

test config_accepts_max_allowance_entries() {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(
        admin_user_with(
          ["w"],
          make_allowance_entries(10),
          make_allowance_entries(10),
        ),
      ),
    )
}

test config_rejects_too_many_per_day_allowance_entries() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(
        admin_user_with(["w"], make_allowance_entries(11), []),
      ),
    )
}

test config_rejects_too_many_remaining_allowance_entries() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(
        admin_user_with(["w"], [], make_allowance_entries(11)),
      ),
    )
}

// beneficiary_wallets

test config_accepts_max_beneficiary_wallets() {
  expect
    state_configuration.expect_valid_state_configuration(
      fixtures.state(
        [fixtures.admin_user("admin")],
        None,
        [fixtures.beneficiary(1, make_wallets(10), Some(100), 1)],
        Some(100),
        Some(50),
        [],
      ),
    )
}

test config_rejects_too_many_beneficiary_wallets() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      fixtures.state(
        [fixtures.admin_user("admin")],
        None,
        [fixtures.beneficiary(1, make_wallets(11), Some(100), 1)],
        Some(100),
        Some(50),
        [],
      ),
    )
}

// wallet_name byte length

test config_accepts_max_wallet_name() {
  let base = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    None,
    None,
    [],
  )
  expect
    state_configuration.expect_valid_state_configuration(
      state_types.State { ..base, wallet_name: from_int_big_endian(0, 32) },
    )
}

test config_rejects_too_long_wallet_name() fail {
  let base = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    None,
    None,
    [],
  )
  expect
    state_configuration.expect_valid_state_configuration(
      state_types.State { ..base, wallet_name: from_int_big_endian(0, 33) },
    )
}
