//// Wallet-side UTxO plumbing: locating the forwarded STT, decoding its state
//// and spend redeemer, and snapshotting wallet value movement.
////
//// Extracted from `validators/wallet.ak` so this module owns the UTxO-decoding
//// boilerplate; the per-action decision logic lives in `lib/wallet/rules.ak`,
//// dispatched from `validators/wallet.ak::eval_spend`. All functions are
//// `pub` because the validator imports them; that also leaves them open to
//// white-box unit tests from `_tests.ak` siblings (the same trade
//// `lib/stt/io.ak` documents), though today they are exercised end-to-end
//// through `wallet.eval_spend`.

use aiken/collection/dict.{Dict}
use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Address, Credential}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Spend, Transaction,
}
use cardano/transaction/output_reference
use state/types as state_types

/// The forwarded STT transition as the wallet reads it: both `State` datums,
/// the `SttAction` the STT validator authorized, and where the STT sat.
pub type ForwardedSttState {
  input_state: state_types.State,
  output_state: state_types.State,
  stt_action: state_types.SttAction,
  stt_input_reference: OutputReference,
  stt_address: Address,
}

/// Extract the forwarded STT datum and the STT spend redeemer that authorize
/// the wallet action.
///
/// PRECONDITIONS (enforced by `validators/stt.ak`, not re-checked here):
///   - exactly one transaction input carries the STT token
///   - exactly one continuing output carries the STT token
///   - both sit at the STT script address
///   - the continuing output carries an inline `State` datum
///   - the STT spend has a redeemer keyed by its `output_reference`
///
/// It LOCATES the STT input/output (to look up the redeemer and read both
/// states) and decodes the inline `State` datum on each side. The input state
/// is needed by the beneficiary rule, which reads weights from the set BEFORE
/// the acting beneficiary is removed. Both datums are trustworthy because the
/// STT validator validated this exact transition; if the STT didn't fire, the
/// redeemer lookup below fails.
pub fn expect_forwarded_stt_output(
  policy_id: PolicyId,
  asset_name: ByteArray,
  self: Transaction,
) -> ForwardedSttState {
  let Transaction { inputs, outputs, redeemers, .. } = self

  expect Some(stt_input) = list.find(
    inputs,
    fn(input) { quantity_of(input.output.value, policy_id, asset_name) == 1 },
  )
  expect InlineDatum(input_datum) = stt_input.output.datum
  expect input_state: state_types.State = input_datum

  expect Some(stt_output) = list.find(
    outputs,
    fn(output) { quantity_of(output.value, policy_id, asset_name) == 1 },
  )
  expect InlineDatum(output_datum) = stt_output.datum
  expect output_state: state_types.State = output_datum

  // Read the STT spend redeemer alongside the datum so the wallet can branch
  // on the action the STT just authorized.
  expect Some(stt_redeemer) = pairs.get_first(
    redeemers,
    Spend(stt_input.output_reference),
  )
  expect stt_action: state_types.SttAction = stt_redeemer

  ForwardedSttState {
    input_state,
    output_state,
    stt_action,
    stt_input_reference: stt_input.output_reference,
    stt_address: stt_output.address,
  }
}

/// Aggregated value movement across every wallet UTxO with the same payment
/// credential. Computed once per spend and consumed by
/// `wallet/rules.stt_action_allows_spend`.
pub type WalletValueSnapshot {
  /// Sum of consumed wallet inputs before this transaction's spend.
  input_value: assets.Value,
  /// Sum of wallet outputs after this transaction's spend (continuing wallet
  /// state).
  output_value: assets.Value,
  /// Number of consumed wallet inputs (same payment-credential filter as
  /// `input_value`). With `output_count`, bounds UTxO-layout churn on the
  /// crank (see `wallet/rules`' `PayStreamingPayment` branch).
  input_count: Int,
  /// Number of continuing wallet outputs (same filter as `output_value`).
  output_count: Int,
}

/// Same-script wallet inputs share one full validator execution. Every input
/// derives this group from the payment credential, so stale stake credentials
/// cannot split the group. The least output reference is its unique leader.
pub type WalletInputGroup {
  input_count: Int,
  leader_reference: OutputReference,
}

fn native_policy_pairs_fit(
  policies: Pairs<PolicyId, Dict<ByteArray, Int>>,
  remaining: Int,
) -> Bool {
  when policies is {
    [] -> True
    [Pair(policy_id, tokens), ..tail] ->
      if policy_id == assets.ada_policy_id {
        native_policy_pairs_fit(tail, remaining)
      } else {
        native_asset_pairs_fit(dict.to_pairs(tokens), tail, remaining)
      }
  }
}

fn native_asset_pairs_fit(
  tokens: Pairs<ByteArray, Int>,
  remaining_policies: Pairs<PolicyId, Dict<ByteArray, Int>>,
  remaining: Int,
) -> Bool {
  when tokens is {
    [] -> native_policy_pairs_fit(remaining_policies, remaining)
    [_, ..tail] ->
      if remaining <= 0 {
        False
      } else {
        native_asset_pairs_fit(tail, remaining_policies, remaining - 1)
      }
  }
}

fn value_has_at_most_native_assets(value: assets.Value, maximum: Int) -> Bool {
  native_policy_pairs_fit(assets.to_pairs(value), maximum)
}

/// Bound native-asset rows on both sides before any wallet Value merge.
pub fn bounded_wallet_values_have_at_most_native_assets(
  inputs: List<Input>,
  outputs: List<Output>,
  wallet_payment_credential: Credential,
  maximum: Int,
) -> Bool {
  and {
    list.all(
      inputs,
      fn(input) {
        input.output.address.payment_credential != wallet_payment_credential || value_has_at_most_native_assets(
          input.output.value,
          maximum,
        )
      },
    )?,
    list.all(
      outputs,
      fn(output) {
        output.address.payment_credential != wallet_payment_credential || value_has_at_most_native_assets(
          output.value,
          maximum,
        )
      },
    )?,
  }
}

/// Count all consumed inputs under one wallet payment credential and choose the
/// least output reference. `own_ref` belongs to that group and seeds the fold.
pub fn wallet_input_group(
  inputs: List<Input>,
  wallet_payment_credential: Credential,
  own_ref: OutputReference,
) -> WalletInputGroup {
  list.foldl(
    inputs,
    WalletInputGroup { input_count: 0, leader_reference: own_ref },
    fn(input, group) {
      if input.output.address.payment_credential == wallet_payment_credential {
        WalletInputGroup {
          input_count: group.input_count + 1,
          leader_reference: if output_reference.compare(
            input.output_reference,
            group.leader_reference,
          ) == Less {
            input.output_reference
          } else {
            group.leader_reference
          },
        }
      } else {
        group
      }
    },
  )
}

/// Snapshot the wallet's input and output values across every UTxO whose
/// payment credential matches the consumed wallet input. Matching by payment
/// credential aggregates value consistently across stake variants. This stops
/// one transaction from applying a beneficiary share cap once per variant.
pub fn collect_wallet_value_snapshot(
  inputs: List<Input>,
  outputs: List<Output>,
  wallet_address: Address,
  maximum_native_assets: Option<Int>,
) -> WalletValueSnapshot {
  let wallet_payment_credential = wallet_address.payment_credential
  when maximum_native_assets is {
    Some(maximum) -> {
      expect
        bounded_wallet_values_have_at_most_native_assets(
          inputs,
          outputs,
          wallet_payment_credential,
          maximum,
        )
    }
    None -> Void
  }
  let wallet_inputs = inputs
    |> list.filter(
        fn(input) {
          input.output.address.payment_credential == wallet_payment_credential
        },
      )
  let wallet_outputs = outputs
    |> list.filter(
        fn(output) {
          output.address.payment_credential == wallet_payment_credential
        },
      )

  let input_accumulator = list.foldl(
    wallet_inputs,
    Pair(0, assets.zero),
    fn(input, acc) {
      let Pair(count, value) = acc
      Pair(
        count + 1,
        if count == 0 {
          input.output.value
        } else {
          assets.merge(value, input.output.value)
        },
      )
    },
  )
  let output_accumulator = list.foldl(
    wallet_outputs,
    Pair(0, assets.zero),
    fn(output, acc) {
      let Pair(count, value) = acc
      Pair(
        count + 1,
        if count == 0 {
          output.value
        } else {
          assets.merge(value, output.value)
        },
      )
    },
  )
  let Pair(input_count, input_value) = input_accumulator
  let Pair(output_count, output_value) = output_accumulator

  // The pre-merge check caps each UTxO. This aggregate check also caps the
  // union when consolidation consumes two UTxOs with different assets.
  when maximum_native_assets is {
    Some(maximum) -> {
      expect or {
          input_count <= 1,
          value_has_at_most_native_assets(input_value, maximum),
        }
      expect or {
          output_count <= 1,
          value_has_at_most_native_assets(output_value, maximum),
        }
    }
    None -> Void
  }

  WalletValueSnapshot {
    input_value,
    output_value,
    // UTxO counts over the SAME filtered lists as the value sums, so the
    // crank's anti-fragmentation bound (`wallet/rules`, PayStreamingPayment
    // branch) and the value aggregation can never disagree about what counts
    // as a wallet UTxO.
    input_count,
    output_count,
  }
}
