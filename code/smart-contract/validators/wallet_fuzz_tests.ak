//// Validator-level property tests for the wallet `spend` entry point. Each test
//// fuzzes ONE adversarial dimension of an otherwise well-formed wallet-spend
//// transaction and asserts `wallet.eval_spend`'s response over the whole input
//// space — complementing the hand-picked cases in `wallet_spend_tests.ak`.
////
//// `fail` properties assert REJECTION for every generated case (rejection here
//// happens via `expect`, which errors — exactly what `fail` accepts); the lone
//// non-`fail` property asserts a valid spend is accepted across a fuzzed value
//// range. These drive the `pub` `wallet.eval_spend` body, so they live in this
//// `_tests.ak` sibling rather than inline in the validator (tests never live in
//// logic files).

use aiken/fuzz
use aiken/interval
use cardano/address.{Inline, VerificationKey}
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use test_support/fuzz_generators as gen
use test_support/security_fixtures as fixtures
use test_support/wallet_test_helpers as helpers
use wallet

fn run_spend(tx: Transaction) -> Bool {
  wallet.eval_spend(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    None,
    0,
    fixtures.wallet_input_ref(),
    tx,
  )
}

// No matter what stake credential is pinned onto a CONTINUING wallet output, an
// enterprise wallet (intended_stake_credential = None) rejects the spend. This
// fuzzes the "Franken-stake" re-homing defense over the whole credential space
// (see wallet.ak `expect_wallet_outputs_use_intended_stake`).
test prop_wallet_rejects_foreign_stake_on_continuing_output(
  rogue_key via fuzz.bytearray(),
) fail {
  let rogue_output = fixtures.wallet_output_with_stake(
    assets.from_lovelace(2_000_000),
    Some(Inline(VerificationKey(rogue_key))),
  )
  run_spend(
    helpers.wallet_spend_tx(
      interval.between(0, 100),
      helpers.empty_state(),
      fixtures.operator_use_action(state_types.Admin),
      rogue_output,
      [],
    ),
  )
}

// A streaming-payment payout carrying the correct tag id but sent to ANY address
// other than the streaming payment's configured payee is rejected: value can
// never leak to a non-payee, fuzzed over the destination key space. (`beneficiary1`
// is the configured payee and is excluded so every case is a genuine mismatch.)
test prop_wallet_rejects_tagged_payout_to_non_payee(
  attacker via gen.key_hash_other_than("beneficiary1"),
) fail {
  run_spend(
    helpers.streaming_payment_payout_tx(
      [
        fixtures.wallet_output(assets.from_lovelace(1_000_000)),
        fixtures.tagged_streaming_payment_output(
          fixtures.address_from_key(attacker),
          assets.from_lovelace(1_000_000),
          fixtures.stt_input_ref(),
          1,
        ),
      ],
      [],
      1_000_000,
      #"5f30000000000000000000000000000000000000000000000000000000000000",
    ),
  )
}

// Positive: admin operator-Use authorizes arbitrary wallet movement. With no
// streaming payments (reserve 0) and a matching stake credential, the wallet
// accepts ANY non-negative continuing value — no valid admin spend is wrongly
// rejected anywhere in the value range.
test prop_wallet_admin_use_accepts_any_return_value(
  return_lovelace via fuzz.int_at_least(0),
) {
  run_spend(
    helpers.wallet_spend_tx(
      interval.between(0, 100),
      helpers.empty_state(),
      fixtures.operator_use_action(state_types.Admin),
      fixtures.wallet_output(assets.from_lovelace(return_lovelace)),
      [],
    ),
  )
}
