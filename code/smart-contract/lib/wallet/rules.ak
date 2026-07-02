//// Wallet spend-authorization dispatcher: given the STT action that fired,
//// decide whether the wallet may move value and by how much.
////
//// This module owns ONLY the per-action decision matrix (`stt_action_allows_spend`)
//// and the value/context snapshots it reads. The two heavier per-action concerns
//// live in focused siblings so each is easy to validate in isolation:
////   - `payout_routing.ak`     — "can value leak?" (the `PayStreamingPayment` scan)
////   - `beneficiary_share.ak`  — "how much can an heir take?" (the `UseBeneficiary` cap)

use aiken/collection/list
use assets/entries as asset_entries
use cardano/address.{Address}
use cardano/assets
use cardano/transaction.{Output, OutputReference}
use state/types as state_types
use wallet/beneficiary_share
use wallet/payout_routing

/// Aggregated value movement across every wallet UTxO with the same payment
/// credential. Computed once per spend and consumed by `stt_action_allows_spend`.
pub type WalletValueSnapshot {
  /// Sum of consumed wallet inputs before this transaction's spend.
  input_value: assets.Value,
  /// Sum of wallet outputs after this transaction's spend (continuing wallet
  /// state).
  output_value: assets.Value,
  /// Net value that left the wallet to external addresses (i.e.
  /// `input_value - output_value`, minus value already returning to the wallet
  /// itself). This is what action-specific rules bound against.
  paid_out_value: assets.Value,
  /// Number of consumed wallet inputs (same payment-credential filter as
  /// `input_value`). With `output_count`, bounds UTxO-layout churn on the
  /// permissionless crank (see the `PayStreamingPayment` branch).
  input_count: Int,
  /// Number of continuing wallet outputs (same filter as `output_value`).
  output_count: Int,
}

/// Output-side transaction facts a spend rule may need to inspect. Only the
/// `PayStreamingPayment` branch actually reads these — to police where payout
/// assets may land — but they are bundled and passed uniformly so
/// `stt_action_allows_spend` keeps a short, stable signature.
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

/// Match the STT action (read from the STT spend redeemer) to the wallet
/// movement it permits.
///
/// Spend authorization matrix:
///   action                            | spend? | bounded by
///   ----------------------------------+--------+------------------------------------
///   RunOperator(Use, _)               |  yes   | (admin trust — any movement allowed)
///   RunOperator(UpdateState, _)       |  no    | —
///   RunOperator(ManageStreamingPayments,_)|  no    | —
///   RenewProofOfLife                  |  no    | —
///   UseAllowance(spent_allowance)     |  yes   | paid_out_value == spent_allowance
///   UseBeneficiary(id)                |  yes   | weighted share of (wallet − streaming reserve)
///   PayStreamingPayment(payout_delta)     |  yes   | tagged outputs sum to payout_delta; wallet output count <= input count
///   Consolidate(_)                    |  no¹   | wallet input_value == output_value
///   CancelStreamingPayment(id)        |  no    | —
///
/// ¹ Consolidation is technically a "spend" of wallet UTxOs but value must be
///   exactly preserved across the consolidation — no funds leave the wallet.
///   Because value is preserved (every asset's output equals its input), it
///   passes the per-asset streaming-payment reserve gate in `wallet.ak`
///   trivially — no special case needed (see `lib/streaming_payments/funding.ak`).
pub fn stt_action_allows_spend(
  action: state_types.SttAction,
  input_state: state_types.State,
  wallet_values: WalletValueSnapshot,
  streaming_reserve: assets.Value,
  output_context: OutputContext,
) -> Bool {
  when action is {
    // Operator-driven branch: only `Use` authorizes wallet movement. State
    // updates and streaming-payment management on the STT side never touch wallet
    // UTxOs. Intentionally broad: admins are trusted with arbitrary movement
    // once the STT-side authorization gate passes.
    state_types.RunOperator(operator_action) ->
      (operator_action.kind == state_types.Use)?

    // Allowance use can only pay out the exact spent allowance delta.
    state_types.UseAllowance(spent_allowance) -> {
      expect
        asset_entries.flatten_to_entries(wallet_values.paid_out_value) == spent_allowance
      True
    }

    // Beneficiary use is bounded by the beneficiary's weighted share of the
    // distributable pool. The acting beneficiary is removed in the forwarded
    // (output) state, so its weight and the pre-removal weight total are read
    // from the INPUT state — the STT validator already proved the output state
    // equals the input with exactly this beneficiary removed.
    state_types.UseBeneficiary(beneficiary_id) -> {
      expect Some(beneficiary) = list.find(
        input_state.access.beneficiaries,
        fn(beneficiary) { beneficiary.id == beneficiary_id },
      )
      let remaining_weight = list.foldl(
        input_state.access.beneficiaries,
        0,
        fn(other, acc) { acc + other.weight },
      )
      expect
        beneficiary_share.paid_out_within_share(
          beneficiary.weight,
          remaining_weight,
          wallet_values.input_value,
          streaming_reserve,
          wallet_values.paid_out_value,
        )
      True
    }

    // Streaming-payment payout can only pay out the streaming-payment delta computed by the
    // STT, and every non-protocol payout output must be tagged for its exact
    // streaming_payment id and sent to that streaming_payment's configured payout_address.
    //
    // The payout outputs are matched against the INPUT-state streaming-payment
    // set — the SAME set the STT validator iterates in
    // `payout_is_valid`/`total_value_change`. A matured payment is REMOVED from
    // the output state but the STT still routes its full remaining amount to a
    // tagged payout output for that (now-absent) id; matching against the output
    // state would misclassify that legitimate payout as an unauthorized leak and
    // exclude it from the tagged sum, making every matured-removal settlement
    // unspendable. Immutable fields (`payout_address`, `policy_id`, `asset_name`)
    // are identical between input and output for any retained entry, so reading
    // the input set is also correct for partial payouts.
    state_types.PayStreamingPayment(payout_delta) -> {
      expect
        asset_entries.flatten_to_entries(wallet_values.paid_out_value) == payout_delta
      // Anti-fragmentation: the crank is the only wallet spend that needs no
      // signature, so without this bound a permissionless cranker could split
      // the wallet's funds into ever more min-ADA-sized UTxOs (value, stake,
      // and reserve all still hold — the grief is pure layout churn that makes
      // every later owner transaction larger). Pinning the continuing wallet
      // output COUNT to at most the consumed input count means a crank can
      // only keep or shrink the wallet's UTxO count, never grow it; the owner
      // can always re-split via an authorized spend. Count-only on purpose:
      // per-UTxO value matching or a sorted set comparison would cost far more
      // ExUnits for no additional safety (a UTxO set has no order to preserve,
      // and the aggregate value is already pinned by the delta equality above).
      expect wallet_values.output_count <= wallet_values.input_count
      expect
        payout_routing.assets_only_reach_matching_outputs(
          output_context.outputs,
          output_context.wallet_address,
          output_context.stt_input_reference,
          output_context.stt_address,
          input_state.streaming_payments,
          payout_delta,
        )
      True
    }

    // Consolidation must preserve the wallet value exactly.
    state_types.Consolidate(_) -> {
      expect wallet_values.input_value == wallet_values.output_value
      True
    }

    // No wallet spend permitted on proof-of-live renewal.
    state_types.RenewProofOfLife -> False

    // A payee self-cancel is a pure STT state transition — it only lowers one
    // streaming payment's `end_date` and never moves wallet value — so no wallet
    // spend is permitted (like RenewProofOfLife / UpdateState).
    state_types.CancelStreamingPayment(_) -> False
  }
}
