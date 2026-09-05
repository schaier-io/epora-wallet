//// Streaming-payment payout routing: where value may land when the wallet
//// settles a streaming payment.
////
//// One audit concern — "can value leak?". The wallet validator's
//// `PayStreamingPayment` branch (`lib/wallet/rules.ak`) calls
//// `assets_only_reach_matching_outputs` as the anti-leak / double-satisfaction
//// guard; the amount cap for that same action lives on the STT side. The
//// separate "how much can a beneficiary take?" concern lives in the sibling
//// `beneficiary_share.ak`.

use aiken/collection/list
use cardano/address.{Address, Credential}
use cardano/assets.{quantity_of}
use cardano/transaction.{Output, OutputReference}
use constants
use state/types as state_types
use streaming_payments/types.{StreamingPayment} as streaming_payment_type

/// Output-side transaction facts the payout scan inspects: which outputs exist
/// and which addresses count as protocol destinations. Built once by
/// `validators/wallet.ak` and passed whole through
/// `wallet/rules.stt_action_allows_spend` — only the `PayStreamingPayment`
/// branch reads it, but the bundle keeps that dispatcher's signature short and
/// stable, and the labeled fields rule out the silent positional transposition
/// of the two `Address` args that the former 6-arg signature allowed (labels
/// must still be bound correctly at the construction site in `validators/wallet.ak`).
pub type OutputContext {
  /// Address of the wallet UTxO(s) being spent.
  wallet_address: Address,
  /// The consumed STT output reference — pins payout tags to this exact spend.
  stt_input_reference: OutputReference,
  /// Address of the continuing STT output.
  stt_address: Address,
  /// Every transaction output (scanned for unauthorized payout-asset leaks).
  outputs: List<Output>,
}

/// Every payout asset outside the wallet/STT protocol outputs must be a tagged
/// streaming_payment output for the matching streaming_payment id, address, and asset. The
/// tagged outputs must also carry the STT-computed payout delta — EXACTLY for a
/// non-ada asset, or AT LEAST the delta for ada (the crank may top a payee output
/// up to min-UTxO with its own ada; see conjunct (3) below). Either way the wallet
/// itself can only ever move the delta out (`output_value == input_value -
/// payout_delta` in `wallet/rules.ak`), so an unrelated receiver cannot skim
/// extra wallet outflow.
pub fn assets_only_reach_matching_outputs(
  context: OutputContext,
  streaming_payments: List<StreamingPayment>,
  payout_delta: state_types.AssetEntries,
) -> Bool {
  let wallet_address = context.wallet_address
  let stt_input_reference = context.stt_input_reference
  let stt_address = context.stt_address
  let outputs = context.outputs
  when payout_delta is {
    [] -> True
    _ -> and {
        // The STT computes at most one distinct payout asset per configured stream.
        // Enforce that bound here before inspecting transaction outputs, so a forged
        // wallet-side action cannot turn this list back into an unbounded scan.
        (list.length(payout_delta) <= constants.max_streaming_payouts_per_transaction)?,
        // Payouts only move assets out of the wallet.
        list.all(payout_delta, fn(asset) { asset.quantity >= 0 })?,
        {
          // Resolve each output tag once. The fold checks only the bounded payout
          // delta, so unrelated assets on a payee output cannot inflate this scan.
          let Pair(outputs_are_legal, tagged_value) = collect_tagged_payout_value(
            outputs,
            stt_input_reference,
            streaming_payments,
            payout_delta,
            wallet_address.payment_credential,
            stt_address,
          )
          and {
            outputs_are_legal?,
            tagged_quantities_match_delta(tagged_value, payout_delta)?,
          }
        }?,
      }
  }
}

// Scan each output once. The Bool records the anti-leak result. The Value sums
// payout assets across outputs with a valid stream tag and configured address.
fn collect_tagged_payout_value(
  outputs: List<Output>,
  stt_input_reference: OutputReference,
  streaming_payments: List<StreamingPayment>,
  payout_delta: state_types.AssetEntries,
  wallet_payment_credential: Credential,
  stt_address: Address,
) -> Pair<Bool, assets.Value> {
  list.foldl(
    outputs,
    Pair(True, assets.zero),
    fn(output, acc) {
      let Pair(outputs_are_legal, tagged_value) = acc
      if outputs_are_legal {
        let matching_streaming_payment = find_matching_streaming_payment(
          output,
          stt_input_reference,
          streaming_payments,
        )
        let is_protocol_output = output.address.payment_credential == wallet_payment_credential || output.address == stt_address
        let output_is_legal = is_protocol_output || list.all(
          payout_delta,
          fn(asset) {
            quantity_of(output.value, asset.policy_id, asset.asset_name) == 0 || matching_streaming_payment_allows_asset(
              matching_streaming_payment,
              asset.policy_id,
              asset.asset_name,
            )
          },
        )
        let next_tagged_value = when matching_streaming_payment is {
          Some(streaming_payment) ->
            if list.any(
              payout_delta,
              fn(asset) {
                asset.policy_id == streaming_payment.policy_id && asset.asset_name == streaming_payment.asset_name
              },
            ) {
              assets.add(
                tagged_value,
                streaming_payment.policy_id,
                streaming_payment.asset_name,
                quantity_of(
                  output.value,
                  streaming_payment.policy_id,
                  streaming_payment.asset_name,
                ),
              )
            } else {
              tagged_value
            }
          None -> tagged_value
        }
        Pair(output_is_legal, next_tagged_value)
      } else {
        acc
      }
    },
  )
}

// Find the configured stream named by one output tag. Asset identity stays a
// separate check because the same result serves every payout asset on the output.
fn find_matching_streaming_payment(
  output: Output,
  stt_input_reference: OutputReference,
  streaming_payments: List<StreamingPayment>,
) -> Option<StreamingPayment> {
  when streaming_payment_type.output_payout_tag(output) is {
    Some(output_tag) -> {
      // No `?` on this path selector (§9). A mismatch means this tag belongs
      // to another STT input, not that this output alone rejects the spend.
      let tag_matches_stt_input = and {
        output_tag.transaction_id == stt_input_reference.transaction_id,
        output_tag.output_index == stt_input_reference.output_index,
      }
      if tag_matches_stt_input {
        list.find(
          streaming_payments,
          fn(streaming_payment) {
            // No `?` on this scan predicate (§9). False means this stream is not
            // the output's tagged destination.
            and {
              output_tag.id == streaming_payment.id,
              output.address == streaming_payment.payout_address,
            }
          },
        )
      } else {
        None
      }
    }
    None -> None
  }
}

// A token payout output also needs a ledger min-ADA amount. When ADA is part of
// the same payout transaction, that top-up remains legal on any valid payout
// tag. The aggregate check below still requires the full declared ADA delta to
// reach the ADA stream's own tag, so a token payee cannot divert wallet ADA.
fn matching_streaming_payment_allows_asset(
  matching_streaming_payment: Option<StreamingPayment>,
  policy_id: ByteArray,
  asset_name: ByteArray,
) -> Bool {
  when matching_streaming_payment is {
    Some(streaming_payment) -> or {
        policy_id == assets.ada_policy_id,
        streaming_payment.policy_id == policy_id && streaming_payment.asset_name == asset_name,
      }
    None -> False
  }
}

// Tagged ADA may include a cranker-funded min-UTxO top-up. Every token quantity
// remains exact. This is the same split the former single-asset `assets.match`
// call applied to each payout entry.
fn tagged_quantities_match_delta(
  tagged_value: assets.Value,
  payout_delta: state_types.AssetEntries,
) -> Bool {
  list.all(
    payout_delta,
    fn(asset) {
      let tagged_quantity = quantity_of(
        tagged_value,
        asset.policy_id,
        asset.asset_name,
      )
      if asset.policy_id == assets.ada_policy_id {
        tagged_quantity >= asset.quantity
      } else {
        tagged_quantity == asset.quantity
      }
    },
  )
}
