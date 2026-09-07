//// Wallet UTxO helpers: read the forwarded STT transition, select the wallet
//// input leader, and collect the aggregate wallet value and input/output counts.
//// `wallet/spend.ak` uses these helpers before applying reserve and movement rules.

use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Address, Credential}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Spend, Transaction,
}
use cardano/transaction/output_reference
use state/types as state_types

/// Decode the forwarded STT states and spend redeemer, then pass their fields
/// to `then` through `<-`. Callback order: input_state, output_state,
/// stt_action, stt_input_reference, stt_address. The address is the STT output's.
/// Backpassing avoids constructing a temporary transition record.
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
/// is needed by the beneficiary rule, which reads weights from the set before
/// an earlier beneficiary is removed. Both datums are trustworthy because the
/// STT validator validated this exact transition; if the STT didn't fire, the
/// redeemer lookup below fails.
pub fn expect_forwarded_stt_output(
  policy_id: PolicyId,
  asset_name: ByteArray,
  self: Transaction,
  then: fn(
    state_types.State,
    state_types.State,
    state_types.SttAction,
    OutputReference,
    Address,
  ) ->
    result,
) -> result {
  let Transaction { inputs, outputs, redeemers, .. } = self

  let stt_input = list.expect_find(
    inputs,
    fn(input) { quantity_of(input.output.value, policy_id, asset_name) == 1 },
  )
  expect InlineDatum(input_datum) = stt_input.output.datum
  expect input_state: state_types.State = input_datum

  let stt_output = list.expect_find(
    outputs,
    fn(output) { quantity_of(output.value, policy_id, asset_name) == 1 },
  )
  expect InlineDatum(output_datum) = stt_output.datum
  expect output_state: state_types.State = output_datum

  // Read the STT spend redeemer alongside the datum so the wallet can branch
  // on the action the STT just authorized.
  let stt_redeemer = pairs.expect_get_first(
    redeemers,
    Spend(stt_input.output_reference),
  )
  expect stt_action: state_types.SttAction = stt_redeemer

  then(
    input_state,
    output_state,
    stt_action,
    stt_input.output_reference,
    stt_output.address,
  )
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
  /// `input_value`). With `output_count`, bounds UTxO-layout churn on allowance,
  /// beneficiary, and streaming-payout branches (see `wallet/rules`).
  input_count: Int,
  /// Number of continuing wallet outputs (same filter as `output_value`).
  output_count: Int,
}

/// Choose the least output reference among all consumed inputs under one wallet
/// payment credential. `own_ref` belongs to that group and seeds the fold.
/// Inputs at different stake credentials remain in the same group.
pub fn wallet_input_leader_reference(
  inputs: List<Input>,
  wallet_payment_credential: Credential,
  own_ref: OutputReference,
) -> OutputReference {
  list.foldl(
    inputs,
    own_ref,
    fn(input, leader_reference) {
      if input.output.address.payment_credential == wallet_payment_credential {
        if output_reference.compare(input.output_reference, leader_reference) == Less {
          input.output_reference
        } else {
          leader_reference
        }
      } else {
        leader_reference
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
) -> WalletValueSnapshot {
  let wallet_payment_credential = wallet_address.payment_credential
  let input_accumulator = list.foldl(
    inputs,
    Pair(0, assets.zero),
    fn(input, acc) {
      if input.output.address.payment_credential == wallet_payment_credential {
        accumulate_wallet_value(input.output.value, acc)
      } else {
        acc
      }
    },
  )
  let output_accumulator = list.foldl(
    outputs,
    Pair(0, assets.zero),
    fn(output, acc) {
      if output.address.payment_credential == wallet_payment_credential {
        accumulate_wallet_value(output.value, acc)
      } else {
        acc
      }
    },
  )
  let Pair(input_count, input_value) = input_accumulator
  let Pair(output_count, output_value) = output_accumulator

  WalletValueSnapshot {
    input_value,
    output_value,
    // UTxO counts use the same credential check as the value sums, so the
    // action-specific layout bounds (`wallet/rules`: UseAllowance,
    // UseBeneficiary, and PayStreamingPayment) and value aggregation can never
    // disagree about what counts as a wallet UTxO.
    input_count,
    output_count,
  }
}

fn accumulate_wallet_value(
  added_value: assets.Value,
  acc: Pair<Int, assets.Value>,
) -> Pair<Int, assets.Value> {
  let Pair(count, value) = acc
  Pair(
    count + 1,
    if count == 0 {
      added_value
    } else {
      assets.merge(value, added_value)
    },
  )
}
