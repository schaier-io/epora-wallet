//// Stake pinning: where may continuing wallet funds be re-homed? Every output
//// returning to the wallet's payment credential must carry the `State`'s
//// intended stake credential — the defense against "Franken address" re-homing
//// of the funds' delegation/rewards (guard W1 in INTERACTIONS.md). One audit
//// concern, sibling to `payout_routing.ak` ("can value leak?") and
//// `beneficiary_share.ak` ("how much can a beneficiary take?").

use aiken/collection/list
use cardano/address.{Credential, Inline, Referenced}
use cardano/transaction.{Output}

/// Every continuing wallet output (matched by payment credential — the same
/// aggregation key used for value) must carry the intended stake credential.
/// Outputs to OTHER addresses (streaming-payment payees, beneficiaries, the
/// spender's own change) are unconstrained — only funds RETURNING to the wallet
/// are pinned.
///
/// `pub` so `stake_pinning_tests.ak` can pin the decision matrix directly with
/// one-output lists; `output_stake_matches_intended` stays private behind it.
pub fn expect_wallet_outputs_use_intended_stake(
  outputs: List<Output>,
  wallet_payment_credential: Credential,
  intended_stake_credential: Option<Credential>,
) -> Bool {
  list.all(
    outputs,
    fn(output) {
      if output.address.payment_credential == wallet_payment_credential {
        output_stake_matches_intended(
          output.address.stake_credential,
          intended_stake_credential,
        )?
      } else {
        True
      }
    },
  )
}

// A wallet output's stake credential matches the intended one: both absent
// (enterprise address), or both an INLINE credential that is equal. A pointer
// stake credential, or any None/Some mismatch, is rejected.
fn output_stake_matches_intended(
  output_stake_credential: Option<Referenced<Credential>>,
  intended_stake_credential: Option<Credential>,
) -> Bool {
  when (output_stake_credential, intended_stake_credential) is {
    (None, None) -> True
    (Some(Inline(output_credential)), Some(intended_credential)) ->
      output_credential == intended_credential
    _ -> False
  }
}
