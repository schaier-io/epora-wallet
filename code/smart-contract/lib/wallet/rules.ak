use aiken/collection/list
use aiken/fuzz
use assets/entries as asset_entries
use cardano/address.{Address, Credential}
use cardano/assets.{quantity_of}
use cardano/transaction.{Output, OutputReference}
use state/types as state_types
use streaming_payments/types.{OutputId,
  StreamingPayment} as streaming_payment_type

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
///   PayStreamingPayment(payout_delta)     |  yes   | tagged outputs sum to payout_delta
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
      operator_action.kind == state_types.Use

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
        beneficiary_paid_out_within_weighted_share(
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
      expect
        payout_assets_only_reach_matching_outputs(
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
  is_irrelevant_output || output_matches_streaming_payment_payout_asset(
    output,
    stt_input_reference,
    streaming_payments,
    policy_id,
    asset_name,
  )
}

// Every payout asset outside the wallet/STT protocol outputs must be a tagged
// streaming_payment output for the matching streaming_payment id, address, and asset. The
// tagged outputs must also sum exactly to the STT-computed payout delta, so an
// unrelated streaming_payment receiver cannot receive extra wallet outflow.
fn payout_assets_only_reach_matching_outputs(
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
        asset.quantity >= 0,
        // (2) Every output holding this asset must be a legal destination.
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
        ),
        // (3) The tagged streaming-payment outputs must sum to the declared delta
        //     (no over- or under-payment routed through tagged outputs).
        tagged_streaming_payment_output_quantity_for_asset(
          outputs,
          stt_input_reference,
          streaming_payments,
          asset.policy_id,
          asset.asset_name,
        ) == asset.quantity,
      }
    },
  )
}

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

// A beneficiary may take at most its weighted share of the distributable pool,
// computed per asset:
//
//   pool(asset) = max(0, wallet_input(asset) − streaming_reserve(asset))
//   max_take    = floor( weight_self / remaining_weight × pool(asset) )
//
// `remaining_weight` is the sum of weights of all beneficiaries still present
// in the input state (the acting one included), so it is always >= 1 and the
// shares of any subset re-normalise to the whole pool as beneficiaries are
// removed. Subtracting the streaming reserve first keeps a beneficiary from
// drawing the streaming-payment amount ACCRUED-BUT-UNPAID as of the tx upper
// bound (`tx_latest_time`). NOTE: this is a point-in-time guard, not a
// full-schedule one — the reserve only covers accrual up to `tx_latest_time`,
// which the spender chooses (subject to `tx_earliest >= unlock_time`). A
// beneficiary can therefore pick an early upper bound and draw funds that the
// streaming payment's FUTURE accrual will need; a future-dated payment
// (start > tx_latest) is reserved at 0. Protecting the full remaining schedule
// would require reserving `total_remaining_obligation` here instead — a
// deliberate trade-off (it would let long streaming payments starve heirs).
//
// The bound is checked in the division-free form
// `quantity × remaining_weight ≤ weight_self × pool`, which is equivalent to
// `quantity ≤ floor(weight_self × pool / remaining_weight)` for the
// non-negative integers involved.
fn beneficiary_paid_out_within_weighted_share(
  weight_self: Int,
  remaining_weight: Int,
  input_value: assets.Value,
  streaming_reserve: assets.Value,
  paid_out_value: assets.Value,
) -> Bool {
  asset_entries.every_asset(
    paid_out_value,
    fn(asset) {
      asset_payout_within_weighted_share(
        asset,
        weight_self,
        remaining_weight,
        input_value,
        streaming_reserve,
      )
    },
  )
}

// Per-asset weighted-share bound for one paid-out asset (division-free form; see
// `beneficiary_paid_out_within_weighted_share` for the full derivation).
fn asset_payout_within_weighted_share(
  asset: state_types.AssetEntry,
  weight_self: Int,
  remaining_weight: Int,
  input_value: assets.Value,
  streaming_reserve: assets.Value,
) -> Bool {
  // Negative or zero net movement (value returning to the wallet) never
  // exceeds a non-negative share.
  if asset.quantity <= 0 {
    True
  } else {
    // Same `distributable_pool` helper the property tests exercise — keep the
    // production clamp and the tested clamp as one definition so they can't drift.
    let reserved = quantity_of(
      streaming_reserve,
      asset.policy_id,
      asset.asset_name,
    )
    let input_amount = quantity_of(
      input_value,
      asset.policy_id,
      asset.asset_name,
    )
    let pool = distributable_pool(input_amount, reserved)
    asset.quantity * remaining_weight <= weight_self * pool
  }
}

// The pool a beneficiary's weighted share is taken against: the wallet input for
// an asset minus its streaming-payment reserve, clamped at 0 (a reserve larger
// than the balance yields an empty pool, never a negative one). Shared by the
// production check above and the property tests below so both clamp identically.
fn distributable_pool(input_amount: Int, reserve_amount: Int) -> Int {
  let available = input_amount - reserve_amount
  if available > 0 {
    available
  } else {
    0
  }
}

// ===========================================================================
// Property-based coverage for the weighted-share bound, the arithmetic that
// caps each beneficiary's recovery. Single-asset (ada) values are enough to
// exercise the per-asset rule. `remaining_weight` is built as
// `weight_self + other + 1`, so it is always >= 1 and `weight_self` never
// exceeds it — matching the on-chain invariant (the acting beneficiary is one of
// the beneficiaries summed into `remaining_weight`).
// ===========================================================================

// The exact floor boundary: a take equal to floor(weight_self * pool /
// remaining_weight) passes, and one unit more fails. This pins the rounding of
// the division-free check against the integer floor it is meant to equal.
test prop_weighted_share_boundary_is_exact_floor(
  args via fuzz.both(
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
  ),
) {
  let ((input_amount, reserve_amount), (weight_self, other_weight)) = args
  let remaining_weight = weight_self + other_weight + 1
  let input_value = assets.from_lovelace(input_amount)
  let streaming_reserve = assets.from_lovelace(reserve_amount)
  let pool = distributable_pool(input_amount, reserve_amount)
  let max_share = weight_self * pool / remaining_weight
  let passes_at_max = beneficiary_paid_out_within_weighted_share(
    weight_self,
    remaining_weight,
    input_value,
    streaming_reserve,
    assets.from_lovelace(max_share),
  )
  let fails_above_max = !beneficiary_paid_out_within_weighted_share(
    weight_self,
    remaining_weight,
    input_value,
    streaming_reserve,
    assets.from_lovelace(max_share + 1),
  )
  and {
    passes_at_max,
    fails_above_max,
  }
}

// A single beneficiary can never take more than the whole distributable pool:
// any take that passes the share check is bounded by the pool, since
// `weight_self <= remaining_weight`.
test prop_weighted_share_take_never_exceeds_pool(
  args via fuzz.both(
    fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
    fuzz.both(
      fuzz.both(fuzz.int_at_least(0), fuzz.int_at_least(0)),
      fuzz.int_at_least(0),
    ),
  ),
) {
  let ((input_amount, reserve_amount), ((weight_self, other_weight), take)) = args
  let remaining_weight = weight_self + other_weight + 1
  let pool = distributable_pool(input_amount, reserve_amount)
  let passes = beneficiary_paid_out_within_weighted_share(
    weight_self,
    remaining_weight,
    assets.from_lovelace(input_amount),
    assets.from_lovelace(reserve_amount),
    assets.from_lovelace(take),
  )
  !passes || take <= pool
}
