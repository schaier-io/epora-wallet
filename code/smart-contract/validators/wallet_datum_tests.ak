//// Continuing wallet outputs must not introduce a datum preimage dependency.
//// These tests run the STT and wallet checks for a listed user's zero-value
//// settlement. They exercise validator logic, not ledger witness validation.

use aiken/builtin.{blake2b_256, serialise_data}
use aiken/collection/dict
use aiken/interval
use cardano/assets
use cardano/transaction.{
  Datum, DatumHash, InlineDatum, Input, NoDatum, Output, Transaction,
}
use state/configuration
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use wallet
use wallet/stake_pinning

fn listed_user_crank(input_datum: Datum, output_datum: Datum) -> Transaction {
  let input_state = states.base_state()
    |> states.with_users(
        [states.admin_user("admin"), states.renewing_user(1, "keeper")],
      )
    |> states.with_proof_of_life(1000, 1000)
  expect configuration.expect_valid_state_configuration(input_state)
  let output_state = state_types.State {
    ..input_state,
    last_non_admin_payout_at: Some(100),
  }
  let value = assets.from_lovelace(2_000_000)
  let wallet_input = fixtures.wallet_input(fixtures.wallet_input_ref(), value)
  fixtures.transaction_with_stt_redeemer(
    interval.between(0, 100),
    [fixtures.key_hash("keeper")],
    [
      fixtures.stt_input(
        fixtures.stt_input_ref(),
        fixtures.default_policy_id(),
        input_state,
        fixtures.default_stt_value(),
      ),
      Input {
        ..wallet_input,
        output: Output { ..wallet_input.output, datum: input_datum },
      },
    ],
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        output_state,
        fixtures.default_stt_value(),
      ),
      Output { ..fixtures.wallet_output(value), datum: output_datum },
    ],
    fixtures.tx_id(#"da01"),
    fixtures.stt_input_ref(),
    state_types.PayStreamingPayment([]),
  )
}

fn check_crank(tx: Transaction) -> Bool {
  expect
    stt.eval_spend(
      None,
      state_types.PayStreamingPayment([]),
      fixtures.stt_input_ref(),
      tx,
    )
  wallet.eval_spend(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    None,
    0,
    fixtures.wallet_input_ref(),
    tx,
  )
}

test wallet_datum_rejects_hash_in_shared_output_guard() {
  !stake_pinning.expect_wallet_outputs_are_well_formed(
    [
      Output {
        ..fixtures.wallet_output(assets.from_lovelace(2_000_000)),
        datum: DatumHash(fixtures.tx_id(#"da02")),
      },
    ],
    fixtures.wallet_script_address().payment_credential,
    None,
  )
}

test wallet_datum_rejects_listed_user_crank_with_hashed_continuation() fail {
  expect
    check_crank(listed_user_crank(NoDatum, DatumHash(fixtures.tx_id(#"da02"))))
}

// Positive twin: the same State, authority, time bounds, values and action pass.
test wallet_datum_accepts_listed_user_crank_without_datum() {
  check_crank(listed_user_crank(NoDatum, NoDatum))
}

test wallet_datum_accepts_inline_continuation() {
  check_crank(listed_user_crank(NoDatum, InlineDatum(0)))
}

test wallet_datum_accepts_legacy_inline_input() {
  check_crank(listed_user_crank(InlineDatum(0), NoDatum))
}

test wallet_datum_accepts_legacy_hash_input_with_known_preimage() {
  let datum: Data = 0
  let hash = blake2b_256(serialise_data(datum))
  let tx = listed_user_crank(DatumHash(hash), NoDatum)
  check_crank(
    Transaction { ..tx, datums: dict.from_pairs([Pair(hash, datum)]) },
  )
}

test wallet_datum_leaves_other_destinations_unrestricted() {
  stake_pinning.expect_wallet_outputs_are_well_formed(
    [
      Output {
        ..fixtures.payout_output(
          fixtures.address_from_key("payee"),
          assets.from_lovelace(2_000_000),
        ),
        datum: DatumHash(fixtures.tx_id(#"da02")),
      },
    ],
    fixtures.wallet_script_address().payment_credential,
    None,
  )
}
