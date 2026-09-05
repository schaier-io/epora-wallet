//// Regression tests for the access/streaming list-size caps
//// (`constants.max_users` / `max_beneficiaries` / `max_streaming_payments`).
//// These bound the per-transaction execution cost so a wallet cannot be grown
//// past the budget and stranded. Mint and every `UpdateState` run
//// `expect_valid_state_configuration`; streaming payments are capped at mint
//// via `shape.is_valid`.

use aiken/interval
use aiken/primitive/bytearray.{from_int_big_endian}
use assets/entries as asset_entries
use cardano/assets
use state/configuration as state_configuration
use state/types as state_types
use streaming_payments/shape as streaming_payment_shape
use streaming_payments/types.{StreamingPayment}
use stt
use stt/io as stt_io
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use test_support/stt_test_helpers.{mint_transaction}

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
      state_types.User {
        ..states.base_user(),
        id: next_id,
        user_wallets: [fixtures.key_hash("admin")],
        is_admin: True,
      },
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
      state_types.Beneficiary {
        ..states.base_beneficiary(),
        id: next_id,
        beneficiary_wallets: [from_int_big_endian(next_id, 28)],
        unlock_after: Some(100),
      },
      ..make_beneficiaries_from(next_id + 1, remaining - 1)
    ]
  }
}

fn max_beneficiary_state() -> state_types.State {
  states.base_state()
    |> states.with_beneficiaries(make_beneficiaries(15))
    |> states.with_proof_of_life(100, 50)
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
      states.ada_streaming_payment(next_id, "payee", 0),
      ..make_streaming_from(next_id + 1, remaining - 1)
    ]
  }
}

// --- accepts exactly at the cap -------------------------------------------

test config_accepts_max_users() {
  expect
    state_configuration.expect_valid_state_configuration(
      states.base_state()
        |> states.with_users(make_users(10)),
    )
}

test config_accepts_max_beneficiaries() {
  expect
    state_configuration.expect_valid_state_configuration(
      max_beneficiary_state(),
    )
}

// Measure the complete validator entry points, not just the configuration
// helper. Both must remain below the ledger's 14M memory / 10B CPU ceilings at
// the advertised beneficiary cap.
test stt_mint_accepts_max_beneficiary_configuration_under_ledger_budget() {
  let input_ref = fixtures.stt_input_ref()
  let policy_id = fixtures.default_policy_id()
  let asset_name = stt_io.output_reference_to_asset_name(input_ref)
  let transaction = mint_transaction(
    assets.from_asset(policy_id, asset_name, 1),
    [
      fixtures.stt_output(
        policy_id,
        max_beneficiary_state(),
        fixtures.stt_value(policy_id, asset_name, 2_000_000),
      ),
    ],
    input_ref,
    fixtures.tx_id(#"c130"),
  )

  expect stt.eval_mint(0, policy_id, transaction)
}

test stt_update_accepts_max_beneficiary_configuration_under_ledger_budget() {
  let input_state = states.admin_state()
  let output_state = max_beneficiary_state()
  let transaction = fixtures.stt_spend_tx(
    interval.after(0),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"c230"),
  )

  expect
    stt.eval_spend(
      None,
      fixtures.operator_action(state_types.Admin, state_types.UpdateState),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test config_accepts_max_streaming_payments() {
  expect streaming_payment_shape.is_valid(make_streaming(15))
}

test config_accepts_max_total_access_records() {
  expect
    state_configuration.expect_valid_state_configuration(
      states.base_state()
        |> states.with_users(make_users(10))
        |> states.with_beneficiaries(make_beneficiaries(5))
        |> states.with_proof_of_life(100, 50),
    )
}

// --- rejects one over the cap ---------------------------------------------

test config_rejects_too_many_users() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      states.base_state()
        |> states.with_users(make_users(11)),
    )
}

test config_rejects_too_many_beneficiaries() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      states.base_state()
        |> states.with_beneficiaries(make_beneficiaries(16))
        |> states.with_proof_of_life(100, 50),
    )
}

test config_rejects_too_many_streaming_payments() fail {
  expect streaming_payment_shape.is_valid(make_streaming(16))
}

test config_rejects_too_many_total_access_records() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      states.base_state()
        |> states.with_users(make_users(10))
        |> states.with_beneficiaries(make_beneficiaries(6))
        |> states.with_proof_of_life(100, 50),
    )
}

// --- inner-collection caps (audit A1) -------------------------------------
//
// The record-count caps above bound the OUTER lists; these bound the INNER
// collections those records carry (per-user wallets/allowance, per-beneficiary
// wallets, wallet_name) so a privileged `UpdateState`/mint cannot commit a
// datum that later transitions can no longer afford to decode. Caps:
// max_wallets_per_user=10, max_allowance_entries=5, max_beneficiary_wallets=10,
// max_wallet_name_bytes=32.

// `count` distinct payment-key hashes.
fn make_wallets(count: Int) -> List<ByteArray> {
  make_wallets_from(1, count)
}

fn make_wallets_from(next: Int, remaining: Int) -> List<ByteArray> {
  if remaining <= 0 {
    []
  } else {
    [
      from_int_big_endian(next, 28),
      ..make_wallets_from(next + 1, remaining - 1)
    ]
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
      asset_entries.asset_entry(
        from_int_big_endian(1, 28),
        from_int_big_endian(next, 4),
        1,
      ),
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
  admin_user_with_id(0, wallets, per_day, remaining)
}

fn admin_user_with_id(
  id: Int,
  wallets: List<ByteArray>,
  per_day: state_types.AssetEntries,
  remaining: state_types.AssetEntries,
) -> state_types.User {
  state_types.User {
    ..states.base_user(),
    id,
    user_wallets: wallets,
    per_day_allowance: per_day,
    remaining_allowance: remaining,
    is_admin: True,
  }
}

fn two_admin_wallet_state(second_user_wallet_count: Int) -> state_types.State {
  states.base_state()
    |> states.with_users(
        [
          admin_user_with_id(1, make_wallets_from(1, 10), [], []),
          admin_user_with_id(
            2,
            make_wallets_from(11, second_user_wallet_count),
            [],
            [],
          ),
        ],
      )
}

// Three valid per-record bundles whose last list controls aggregate cap + 1.
fn allowance_total_state(last_remaining_count: Int) -> state_types.State {
  states.base_state()
    |> states.with_users(
        [
          admin_user_with_id(
            1,
            make_wallets_from(1, 1),
            make_allowance_entries_from(1, 5),
            make_allowance_entries_from(6, 5),
          ),
          admin_user_with_id(
            2,
            make_wallets_from(2, 1),
            make_allowance_entries_from(11, 5),
            [],
          ),
          admin_user_with_id(
            3,
            make_wallets_from(3, 1),
            [],
            make_allowance_entries_from(16, last_remaining_count),
          ),
        ],
      )
}

fn admin_state_with_user(user: state_types.User) -> state_types.State {
  states.base_state()
    |> states.with_users([user])
}

// Two beneficiaries whose wallet lists stay within the per-record cap while
// their combined wallet count is controlled by `last_wallet_count`.
fn beneficiary_state_with_total_wallets(
  last_wallet_count: Int,
) -> state_types.State {
  states.base_state()
    |> states.with_users([states.admin_user("admin")])
    |> states.with_beneficiaries(
        [
          state_types.Beneficiary {
            ..states.base_beneficiary(),
            id: 1,
            beneficiary_wallets: make_wallets_from(1, 10),
            unlock_after: Some(100),
          },
          state_types.Beneficiary {
            ..states.base_beneficiary(),
            id: 2,
            beneficiary_wallets: make_wallets_from(11, last_wallet_count),
            unlock_after: Some(100),
          },
        ],
      )
    |> states.with_proof_of_life(100, 50)
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

test config_accepts_total_user_wallet_cap() {
  expect
    state_configuration.expect_valid_state_configuration(
      two_admin_wallet_state(5),
    )
}

test config_rejects_total_user_wallet_cap_plus_one() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      two_admin_wallet_state(6),
    )
}

// allowance entries (per_day_allowance and remaining_allowance both capped)

test config_accepts_max_allowance_entries() {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(
        admin_user_with(
          [fixtures.key_hash("w")],
          make_allowance_entries(5),
          make_allowance_entries(5),
        ),
      ),
    )
}

test config_rejects_too_many_per_day_allowance_entries() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(
        admin_user_with([fixtures.key_hash("w")], make_allowance_entries(6), []),
      ),
    )
}

test config_rejects_too_many_remaining_allowance_entries() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      admin_state_with_user(
        admin_user_with([fixtures.key_hash("w")], [], make_allowance_entries(6)),
      ),
    )
}

test config_accepts_total_allowance_entry_cap() {
  expect
    state_configuration.expect_valid_state_configuration(
      allowance_total_state(0),
    )
}

test config_rejects_total_allowance_entry_cap_plus_one() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      allowance_total_state(1),
    )
}

// beneficiary_wallets

test config_accepts_max_beneficiary_wallets() {
  expect
    state_configuration.expect_valid_state_configuration(
      states.base_state()
        |> states.with_users([states.admin_user("admin")])
        |> states.with_beneficiaries(
            [
              state_types.Beneficiary {
                ..states.base_beneficiary(),
                id: 1,
                beneficiary_wallets: make_wallets(10),
                unlock_after: Some(100),
              },
            ],
          )
        |> states.with_proof_of_life(100, 50),
    )
}

test config_rejects_too_many_beneficiary_wallets() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      states.base_state()
        |> states.with_users([states.admin_user("admin")])
        |> states.with_beneficiaries(
            [
              state_types.Beneficiary {
                ..states.base_beneficiary(),
                id: 1,
                beneficiary_wallets: make_wallets(11),
                unlock_after: Some(100),
              },
            ],
          )
        |> states.with_proof_of_life(100, 50),
    )
}

// The aggregate cap is independent of both existing beneficiary caps: every
// record stays at or below 10 wallets and the outer list contains only 2 records.
test config_accepts_total_beneficiary_wallet_cap() {
  expect
    state_configuration.expect_valid_state_configuration(
      beneficiary_state_with_total_wallets(5),
    )
}

test config_rejects_total_beneficiary_wallet_cap_plus_one() fail {
  expect
    state_configuration.expect_valid_state_configuration(
      beneficiary_state_with_total_wallets(6),
    )
}

// wallet_name byte length

test config_accepts_max_wallet_name() {
  let base = states.base_state()
    |> states.with_users([states.admin_user("admin")])
  expect
    state_configuration.expect_valid_state_configuration(
      state_types.State { ..base, wallet_name: from_int_big_endian(0, 32) },
    )
}

test config_rejects_too_long_wallet_name() fail {
  let base = states.base_state()
    |> states.with_users([states.admin_user("admin")])
  expect
    state_configuration.expect_valid_state_configuration(
      state_types.State { ..base, wallet_name: from_int_big_endian(0, 33) },
    )
}
