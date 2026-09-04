//// Continuing-wallet-output shape: what may an output returning to the wallet
//// look like? It must carry the `State`'s intended
//// stake credential (the whitepaper's Stake-credential-pinning theorem; the
//// defense against "Franken address" re-homing of the funds' delegation and
//// rewards, mapped as guard W1 in INTERACTIONS.md) and it must carry no
//// reference script (the wallet-side counterpart to the STT's G2 bloat ban; see
//// the Security Analysis "Payout integrity" item). Hashed datums are forbidden
//// because they can make later spending depend on an unavailable preimage.
//// Sibling to `payout_routing.ak` ("can value leak?") and `beneficiary_share.ak`
//// ("how much can a beneficiary take?").

use aiken/collection/list
use cardano/address.{Credential, Inline, Referenced}
use cardano/transaction.{DatumHash, Output}

/// Every continuing wallet output (matched by payment credential — the same
/// aggregation key used for value) must carry the intended stake credential AND
/// no reference script or hashed datum. Outputs to OTHER addresses (streaming-payment payees,
/// beneficiaries, the spender's own change) are unconstrained — only funds
/// RETURNING to the wallet are pinned.
///
/// Check the continuing output shape in one walk.
///
/// `pub` so `stake_pinning_tests.ak` can pin the decision matrix directly with
/// one-output lists; `output_stake_matches_intended` stays private behind it.
pub fn expect_wallet_outputs_are_well_formed(
  outputs: List<Output>,
  wallet_payment_credential: Credential,
  intended_stake_credential: Option<Credential>,
) -> Bool {
  list.all(
    outputs,
    fn(output) {
      if output.address.payment_credential == wallet_payment_credential {
        and {
          output_stake_matches_intended(
            output.address.stake_credential,
            intended_stake_credential,
          )?,
          // Reference scripts are banned for the same reason the STT bans them on
          // its own continuing output (guard G2, `stt/io.is_admin_operator_action`):
          // an attached script is charged per byte on every later transaction that
          // consumes the UTxO and counts toward the per-tx reference-script size
          // limit. The wallet needs the ban MORE than the STT does, because the
          // crank lets a party who is not the owner choose this field — it could
          // bloat continuing wallet outputs every cadence window, and a bloated
          // UTxO set is exactly what breaks the ONE-SHOT `UseBeneficiary` sweep
          // (a beneficiary that cannot fit every wallet UTxO into one transaction
          // forfeits the remainder). Hosting a reference script at the wallet
          // address is not a supported use; put it at the STT reference store.
          (output.reference_script == None)?,
          // Even with Plutus V3, spending a hashed datum requires its preimage.
          // A limited stakeholder must not impose that dependency on wallet funds.
          // Keep inline payout tags and datumless outputs valid. This output-only
          // guard also leaves recoverable legacy deposits spendable.
          when output.datum is {
            DatumHash(_) -> False
            _ -> True
          }?,
        }
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
