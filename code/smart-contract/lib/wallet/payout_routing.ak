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
/// itself can only ever move the delta out (`paid_out_value == payout_delta` in
/// `wallet/rules.ak`), so an unrelated receiver cannot skim extra WALLET outflow.
pub fn assets_only_reach_matching_outputs(
  context: OutputContext,
  streaming_payments: List<StreamingPayment>,
  payout_delta: state_types.AssetEntries,
) -> Bool {
  let  
      OutputContext {
        wallet_address,
        stt_input_reference,
        stt_address,
        outputs,
      }
    = context
  let wallet_payment_credential = wallet_address.payment_credential
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
        //     lovelace too (see the "Payout integrity" note below). CONSEQUENCE for
        //     ADA-denominated streams: no UNTAGGED change output back to the cranker
        //     may carry ada (it would carry the payout lovelace and be an illegal
        //     destination). The cranker's own funding input therefore has exactly two
        //     legal ada sinks — the TAGGED payee output (where its surplus tops the
        //     payout up to min-UTxO; see conjunct (3)) and the TX FEE — and it splits
        //     its input across those two, leaving no residual to return. The fee is
        //     NOT "== the input" once an ada top-up is present: part of the input pays
        //     the top-up, the rest pays the fee. Only the impossibility of an untagged
        //     cranker-change output is enforced here; how the input divides between
        //     top-up and fee is the off-chain builder's choice. This keeps the airtight
        //     guarantee that wallet value can only reach the payee rather than trading
        //     it for a change-output UX convenience. Documented in the whitepaper's
        //     "ADA settlement granularity and fee funding" limitation.
        list.all(
          outputs,
          fn(output) {
            output_is_legal_destination_for_streaming_payment_asset(
              output,
              asset.policy_id,
              asset.asset_name,
              wallet_payment_credential,
              stt_address,
              stt_input_reference,
              streaming_payments,
            )
          },
        )?,
        // (3) The tagged streaming-payment outputs must carry the declared delta —
        //     compared with `assets.match`, whose comparator governs LOVELACE ONLY
        //     while every non-lovelace asset must be structurally EQUAL (the same
        //     idiom, and the same subtlety, that `stt/io.stt_value_preserved_or_increased`
        //     documents). Wrapping each side as a single-asset value makes that split
        //     do the work: for ADA the comparison is `tagged_lovelace >= delta` (the
        //     crank may TOP UP the payee output with its OWN ada to clear min-UTxO,
        //     since an exact-delta ada output below min-UTxO is unconstructible); for
        //     every token it collapses to `tagged == delta` (a token pads its min-UTxO
        //     in ada, a DIFFERENT asset, so it needs no relaxation and cannot shuffle
        //     between same-token payees). Safety does NOT rest on this comparison:
        //     `paid_out_value == payout_delta` (see `wallet/rules.ak`) pins the
        //     wallet's NET outflow to exactly the delta, and conjunct (2) above forbids
        //     the payout asset from reaching any non-payee output — so the wallet's
        //     delta still only ever reaches tagged payees and the ada surplus is
        //     cranker-funded, never wallet-funded. TRADE-OFF (ada only): with several
        //     ada streams settled in one tx, the wallet-sourced ada may shuffle among
        //     their (all configured) payees — neutral: no drain (total outflow is still
        //     pinned to the delta), no leak, and each payee still receives at least its
        //     settled amount (pinned per-stream STT-side with `>=`). See the whitepaper
        //     "Payout integrity" item.
        {
          let tagged_quantity = tagged_streaming_payment_output_quantity_for_asset(
            outputs,
            stt_input_reference,
            streaming_payments,
            asset.policy_id,
            asset.asset_name,
          )
          // `match(tagged, delta, >=)` reads as `tagged_lovelace >= delta_lovelace`
          // for the ada leg and `==` for a token leg — keep `tagged` first (swapping
          // the two would invert the ada direction, as the sibling note warns).
          assets.match(
            assets.from_asset(
              asset.policy_id,
              asset.asset_name,
              tagged_quantity,
            ),
            assets.from_asset(asset.policy_id, asset.asset_name, asset.quantity),
            >=,
          )?
        },
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
  stt_address: Address,
  stt_input_reference: OutputReference,
  streaming_payments: List<StreamingPayment>,
) -> Bool {
  let output_does_not_carry_asset = quantity_of(
    output.value,
    policy_id,
    asset_name,
  ) == 0
  let is_wallet_output = output.address.payment_credential == wallet_payment_credential
  // The STT continuation is pinned by FULL address on the STT side. Mirror that
  // identity here: a tokenless output at the STT payment credential but under a
  // different stake credential is not the continuation and must not become an
  // unchecked sink for payout assets.
  let is_stt_output = output.address == stt_address

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
          let expected_output_id = streaming_payment_type.expected_payout_tag(
            streaming_payment.id,
            stt_input_reference,
          )

          // No `?` on ANY conjunct (§9): this lambda is a `list.any` scan
          // predicate, so a False is a normal miss for every non-matching
          // streaming payment, not a violation — tracing it would fire on each
          // legitimate miss and drown the signal.
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
