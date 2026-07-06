//// Unit tests for the stake-pinning decision matrix
//// (`wallet/stake_pinning.expect_wallet_outputs_use_intended_stake`), driven
//// with one-output lists so every (output stake, intended stake) cell is
//// pinned individually — including the pointer-credential arm, which no
//// transaction-level test reaches. The transaction-level complement is the
//// Franken-stake property in `validators/wallet_fuzz_tests.ak`.

use cardano/address.{Address, Credential, Inline, Pointer, VerificationKey}
use cardano/assets
use test_support/security_fixtures as fixtures
use wallet/stake_pinning

fn wallet_payment_credential() -> Credential {
  fixtures.wallet_script_address().payment_credential
}

fn wallet_output_value() -> assets.Value {
  assets.from_lovelace(2_000_000)
}

// (None, None): an enterprise wallet keeps its continuing outputs enterprise.
test stake_pinning_accepts_enterprise_output_when_no_intended_stake() {
  stake_pinning.expect_wallet_outputs_use_intended_stake(
    [fixtures.wallet_output(wallet_output_value())],
    wallet_payment_credential(),
    None,
  )
}

// (Some(Inline), None): adding ANY stake credential to an enterprise wallet's
// continuing output is the Franken-stake re-homing this guard exists for.
test stake_pinning_rejects_added_stake_when_no_intended_stake() {
  !stake_pinning.expect_wallet_outputs_use_intended_stake(
    [
      fixtures.wallet_output_with_stake(
        wallet_output_value(),
        Some(Inline(VerificationKey("rogue"))),
      ),
    ],
    wallet_payment_credential(),
    None,
  )
}

// (Some(Inline(c)), Some(c)): the continuing output carries exactly the
// intended inline credential.
test stake_pinning_accepts_matching_inline_stake() {
  stake_pinning.expect_wallet_outputs_use_intended_stake(
    [
      fixtures.wallet_output_with_stake(
        wallet_output_value(),
        Some(Inline(VerificationKey("intended"))),
      ),
    ],
    wallet_payment_credential(),
    Some(VerificationKey("intended")),
  )
}

// (Some(Inline(x)), Some(c)), x != c: an inline credential other than the
// intended one is a re-homing and rejects.
test stake_pinning_rejects_mismatched_inline_stake() {
  !stake_pinning.expect_wallet_outputs_use_intended_stake(
    [
      fixtures.wallet_output_with_stake(
        wallet_output_value(),
        Some(Inline(VerificationKey("rogue"))),
      ),
    ],
    wallet_payment_credential(),
    Some(VerificationKey("intended")),
  )
}

// (None, Some(c)): dropping the intended stake credential (back to enterprise)
// also hides the funds from address-based discovery — rejected.
test stake_pinning_rejects_enterprise_output_when_stake_intended() {
  !stake_pinning.expect_wallet_outputs_use_intended_stake(
    [fixtures.wallet_output(wallet_output_value())],
    wallet_payment_credential(),
    Some(VerificationKey("intended")),
  )
}

// (Some(Pointer), Some(c)): a pointer stake credential NEVER matches — the
// intended credential is inline-only, and a pointer's target cannot be
// verified on-chain.
test stake_pinning_rejects_pointer_stake_when_stake_intended() {
  !stake_pinning.expect_wallet_outputs_use_intended_stake(
    [
      fixtures.wallet_output_with_stake(
        wallet_output_value(),
        Some(
          Pointer { slot_number: 1, transaction_index: 2, certificate_index: 3 },
        ),
      ),
    ],
    wallet_payment_credential(),
    Some(VerificationKey("intended")),
  )
}

// (Some(Pointer), None): a pointer stake credential is likewise rejected on an
// enterprise wallet.
test stake_pinning_rejects_pointer_stake_when_no_intended_stake() {
  !stake_pinning.expect_wallet_outputs_use_intended_stake(
    [
      fixtures.wallet_output_with_stake(
        wallet_output_value(),
        Some(
          Pointer { slot_number: 1, transaction_index: 2, certificate_index: 3 },
        ),
      ),
    ],
    wallet_payment_credential(),
    None,
  )
}

// Outputs whose payment credential is NOT the wallet's (payees, beneficiaries,
// the spender's change) are unconstrained — any stake credential passes.
test stake_pinning_ignores_non_wallet_outputs() {
  stake_pinning.expect_wallet_outputs_use_intended_stake(
    [
      fixtures.payout_output(
        Address {
          payment_credential: VerificationKey("payee"),
          stake_credential: Some(Inline(VerificationKey("rogue"))),
        },
        wallet_output_value(),
      ),
    ],
    wallet_payment_credential(),
    None,
  )
}
