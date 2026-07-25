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

use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Address}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Spend, Transaction,
}
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
  /// Net value that left the wallet to external addresses (i.e.
  /// `input_value - output_value`, minus value already returning to the wallet
  /// itself). This is what action-specific rules bound against.
  paid_out_value: assets.Value,
  /// Number of consumed wallet inputs (same payment-credential filter as
  /// `input_value`). With `output_count`, bounds UTxO-layout churn on the
  /// crank (see `wallet/rules`' `PayStreamingPayment` branch).
  input_count: Int,
  /// Number of continuing wallet outputs (same filter as `output_value`).
  output_count: Int,
}

/// Snapshot the wallet's input, output, and paid-out values across every UTxO whose payment
/// credential matches the consumed wallet input. Matching by payment credential (instead of the
/// full Address) aggregates value consistently even when wallet UTxOs exist at multiple stake
/// credentials under the same script hash, which prevents a per-invocation cap (the beneficiary
/// weighted-share bound) from being applied K times across K stake variants in the same transaction.
pub fn collect_wallet_value_snapshot(
  inputs: List<Input>,
  outputs: List<Output>,
  wallet_address: Address,
) -> WalletValueSnapshot {
  let wallet_payment_credential = wallet_address.payment_credential
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

  let input_value = list.foldl(
    wallet_inputs,
    assets.zero,
    fn(input, acc) { assets.merge(acc, input.output.value) },
  )
  let output_value = list.foldl(
    wallet_outputs,
    assets.zero,
    fn(output, acc) { assets.merge(acc, output.value) },
  )

  WalletValueSnapshot {
    input_value,
    output_value,
    // Net value that left the wallet is inputs minus outputs, derived from the
    // two sums above rather than re-folding both lists a second time.
    paid_out_value: assets.merge(input_value, assets.negate(output_value)),
    // UTxO counts over the SAME filtered lists as the value sums, so the
    // crank's anti-fragmentation bound (`wallet/rules`, PayStreamingPayment
    // branch) and the value aggregation can never disagree about what counts
    // as a wallet UTxO.
    input_count: list.length(wallet_inputs),
    output_count: list.length(wallet_outputs),
  }
}
