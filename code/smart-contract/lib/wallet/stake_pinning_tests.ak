//// Unit tests for the continuing-wallet-output shape matrix
//// (`wallet/stake_pinning.expect_wallet_outputs_are_well_formed`), driven
//// with one-output lists so every (output stake, intended stake) cell is
//// pinned individually — including the pointer-credential arm, which no
//// transaction-level test reaches — plus the reference-script ban. The
//// transaction-level complement is the Franken-stake property in
//// `validators/wallet_fuzz_tests.ak` and the crank case in
//// `validators/wallet_spend_tests.ak`.

use cardano/address.{Address, Credential, Inline, Pointer, VerificationKey}
use cardano/assets
use cardano/transaction.{Output}
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
  stake_pinning.expect_wallet_outputs_are_well_formed(
    [fixtures.wallet_output(wallet_output_value())],
    wallet_payment_credential(),
    None,
  )
}

// (Some(Inline), None): adding ANY stake credential to an enterprise wallet's
// continuing output is the Franken-stake re-homing this guard exists for.
test stake_pinning_rejects_added_stake_when_no_intended_stake() {
  !stake_pinning.expect_wallet_outputs_are_well_formed(
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
  stake_pinning.expect_wallet_outputs_are_well_formed(
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
  !stake_pinning.expect_wallet_outputs_are_well_formed(
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
  !stake_pinning.expect_wallet_outputs_are_well_formed(
    [fixtures.wallet_output(wallet_output_value())],
    wallet_payment_credential(),
    Some(VerificationKey("intended")),
  )
}

// (Some(Pointer), Some(c)): a pointer stake credential NEVER matches — the
// intended credential is inline-only, and a pointer's target cannot be
// verified on-chain.
test stake_pinning_rejects_pointer_stake_when_stake_intended() {
  !stake_pinning.expect_wallet_outputs_are_well_formed(
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
  !stake_pinning.expect_wallet_outputs_are_well_formed(
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
  stake_pinning.expect_wallet_outputs_are_well_formed(
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

// A continuing wallet output may carry NO reference script. This is the
// wallet-side counterpart to the STT's G2 ban: the crank lets a party who is not
// the owner choose this field, so without the ban it could bloat continuing
// wallet outputs every cadence window — inflating the per-byte fee on every later
// spend and threatening the ONE-SHOT `UseBeneficiary` sweep, which forfeits
// whatever it cannot fit into a single transaction. Stake credential is correct
// here, so the reference script is the sole reason for rejection.
test stake_pinning_rejects_reference_script_on_wallet_output() {
  !stake_pinning.expect_wallet_outputs_are_well_formed(
    [
      Output {
        ..fixtures.wallet_output(wallet_output_value()),
        reference_script: Some(#"01"),
      },
    ],
    wallet_payment_credential(),
    None,
  )
}

// Outputs to OTHER addresses stay unconstrained: a payee output may carry a
// reference script, since only funds RETURNING to the wallet are pinned.
test stake_pinning_allows_reference_script_on_non_wallet_output() {
  stake_pinning.expect_wallet_outputs_are_well_formed(
    [
      Output {
        ..fixtures.payout_output(
          fixtures.address_from_key("payee"),
          wallet_output_value(),
        ),
        reference_script: Some(#"01"),
      },
    ],
    wallet_payment_credential(),
    None,
  )
}
