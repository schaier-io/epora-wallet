//// Streaming-payment payout routing: where value may land when the wallet
//// settles a streaming payment.
////
//// One audit concern — "can value leak?". The wallet validator's
//// `PayStreamingPayment` branch (`lib/wallet/rules.ak`) calls
//// `assets_only_reach_matching_outputs` as the anti-leak / double-satisfaction
//// guard; the amount cap for that same action lives on the STT side. The
//// separate "how much can an heir take?" concern lives in the sibling
//// `beneficiary_share.ak`.

use aiken/collection/list
use cardano/address.{Address, Credential}
use cardano/assets.{quantity_of}
use cardano/transaction.{Output, OutputReference}
use state/types as state_types
use streaming_payments/types.{OutputId,
  StreamingPayment} as streaming_payment_type

/// Every payout asset outside the wallet/STT protocol outputs must be a tagged
/// streaming_payment output for the matching streaming_payment id, address, and asset. The
/// tagged outputs must also sum exactly to the STT-computed payout delta, so an
/// unrelated streaming_payment receiver cannot receive extra wallet outflow.
pub fn assets_only_reach_matching_outputs(
  outputs: List<Output>,
  wallet_address: Address,
  stt_input_reference: OutputReference,
  stt_address: Address,
  streaming_payments: List<StreamingPayment>,
  payout_delta: state_types.AssetEntries,
) -> Bool {
  let wallet_payment_credential = wallet_address.payment_credential
  let stt_payment_credential = stt_address.payment_credential
  list.all(
    payout_delta,
    fn(asset) {
      and {
        // (1) Deltas must be non-negative — payouts only move asset OUT.
        (asset.quantity >= 0)?,
        // (2) Every output holding this asset must be a legal destination:
        //     a wallet self-return, the STT continuation, or a correctly-tagged
        //     payee output. NOTHING else may carry the payout asset — this is
        //     the anti-leak / double-satisfaction guard, and it holds for
        //     lovelace too (see `payout-integrity` note below). CONSEQUENCE for
        //     ADA-denominated streams: a permissionless cranker cannot emit its
        //     own fee-CHANGE output (every output carries min-ADA, so a change
        //     output would carry the payout lovelace and be an illegal
        //     destination). The cranker instead consumes its funding input
        //     entirely into the tx fee (fee == cranker input, no change) — an
        //     intentional "burn the change into the fee" constraint, documented
        //     in the whitepaper's "ADA settlement fee funding" limitation. This
        //     keeps the airtight guarantee that wallet value can only reach the
        //     payee rather than trading it for a UX convenience.
        list.all(
          outputs,
          fn(output) {
            output_is_legal_destination_for_streaming_payment_asset(
              output,
              asset.policy_id,
              asset.asset_name,
              wallet_payment_credential,
              stt_payment_credential,
              stt_input_reference,
              streaming_payments,
            )
          },
        )?,
        // (3) The tagged streaming-payment outputs must sum to the declared delta
        //     (no over- or under-payment routed through tagged outputs).
        (tagged_streaming_payment_output_quantity_for_asset(
          outputs,
          stt_input_reference,
          streaming_payments,
          asset.policy_id,
          asset.asset_name,
        ) == asset.quantity)?,
      }
    },
  )
}

// True for outputs that may legitimately carry the asset moving out of the
// wallet: wallet UTxOs (returning to ourselves), STT UTxOs (the forwarded
// state), or correctly-tagged streaming-payment payout outputs. Any other output
// holding the asset is an unauthorized leak.
fn output_is_legal_destination_for_streaming_payment_asset(
  output: Output,
  policy_id: ByteArray,
  asset_name: ByteArray,
  wallet_payment_credential: Credential,
  stt_payment_credential: Credential,
  stt_input_reference: OutputReference,
  streaming_payments: List<StreamingPayment>,
) -> Bool {
  let output_does_not_carry_asset = quantity_of(
    output.value,
    policy_id,
    asset_name,
  ) == 0
  let is_wallet_output = output.address.payment_credential == wallet_payment_credential
  let is_stt_output = output.address.payment_credential == stt_payment_credential

  // Outputs we don't police: those without the asset, the wallet's own
  // self-return, and the STT continuation.
  let is_irrelevant_output = output_does_not_carry_asset || is_wallet_output || is_stt_output

  // Any OTHER output carrying the asset must be a valid streaming-payment payout.
  // The trace fires exactly when a leak is detected: an asset-carrying,
  // non-protocol output that matches no tagged payout.
  is_irrelevant_output || output_matches_streaming_payment_payout_asset(
    output,
    stt_input_reference,
    streaming_payments,
    policy_id,
    asset_name,
  )?
}

// Sum of the given asset across all outputs that carry a payout tag matching
// one of the streaming payments (the amount actually routed to payees).
fn tagged_streaming_payment_output_quantity_for_asset(
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  streaming_payments: List<StreamingPayment>,
  policy_id: ByteArray,
  asset_name: ByteArray,
) -> Int {
  list.foldl(
    outputs,
    0,
    fn(output, acc) {
      if output_matches_streaming_payment_payout_asset(
        output,
        stt_input_reference,
        streaming_payments,
        policy_id,
        asset_name,
      ) {
        acc + quantity_of(output.value, policy_id, asset_name)
      } else {
        acc
      }
    },
  )
}

// True when the output is a correctly-tagged payout for one of the streaming
// payments: tag == (payment id, consumed STT ref), address and asset match.
fn output_matches_streaming_payment_payout_asset(
  output: Output,
  stt_input_reference: OutputReference,
  streaming_payments: List<StreamingPayment>,
  policy_id: ByteArray,
  asset_name: ByteArray,
) -> Bool {
  when streaming_payment_type.output_payout_tag(output) is {
    Some(output_tag) ->
      list.any(
        streaming_payments,
        fn(streaming_payment) {
          let expected_output_id = OutputId {
            id: streaming_payment.id,
            transaction_id: stt_input_reference.transaction_id,
            output_index: stt_input_reference.output_index,
          }

          and {
            output_tag == expected_output_id,
            output.address == streaming_payment.payout_address,
            streaming_payment.policy_id == policy_id,
            streaming_payment.asset_name == asset_name,
          }
        },
      )
    None -> False
  }
}
