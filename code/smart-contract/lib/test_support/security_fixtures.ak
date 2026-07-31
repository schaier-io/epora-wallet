//// Shared, pure-data fixture library for the validator test suites: default
//// policy/asset ids, addresses and transaction ids, `Input`/`Output`/
//// `Transaction` builders, and `SttAction` shortcuts. The State-datum shapes
//// it used to also carry (`State`/`User`/`Beneficiary`/`StreamingPayment`)
//// live in `test_support/state_builders` — a separate audit concern, so a
//// separate module. Everything here is plain data construction — none of it
//// touches a validator (lib modules must not import a validator).

use aiken/collection/list
use aiken/primitive/bytearray
use cardano/address.{Address, Credential, Referenced, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Spend, Transaction,
  ValidityRange, placeholder,
}
use constants
use state/types as state_types
use streaming_payments/types.{OutputId}

pub fn default_policy_id() {
  #"aa"
}

pub fn default_asset_name() {
  #"01"
}

pub fn output_ref(
  transaction_id: ByteArray,
  output_index: Int,
) -> OutputReference {
  OutputReference { transaction_id, output_index }
}

/// A 32-byte transaction id from a short prefix (at most 32 bytes),
/// right-padded with zero bytes — ids read as `tx_id(#"1a31")` instead of a
/// 64-character literal, so an accidental duplicate between two tests is
/// visible at a glance.
pub fn tx_id(prefix: ByteArray) -> ByteArray {
  bytearray.concat(
    prefix,
    bytearray.from_int_big_endian(0, 32 - bytearray.length(prefix)),
  )
}

/// Make a ledger-width credential hash from a short human-readable test label.
/// Security regressions for malformed hashes construct their values directly
/// and deliberately bypass this helper.
pub fn key_hash(prefix: ByteArray) -> ByteArray {
  bytearray.concat(
    prefix,
    bytearray.from_int_big_endian(
      0,
      constants.credential_hash_bytes - bytearray.length(prefix),
    ),
  )
}

/// Make a ledger-width native-asset policy id from a short test label.
pub fn policy_id(prefix: ByteArray) -> ByteArray {
  bytearray.concat(
    prefix,
    bytearray.from_int_big_endian(
      0,
      constants.policy_id_bytes - bytearray.length(prefix),
    ),
  )
}

pub fn stt_input_ref() {
  output_ref(tx_id(#"5230"), 0)
}

pub fn secondary_stt_input_ref() {
  output_ref(tx_id(#"5330"), 1)
}

pub fn wallet_input_ref() {
  output_ref(tx_id(#"6230"), 0)
}

pub fn secondary_wallet_input_ref() {
  output_ref(tx_id(#"6330"), 1)
}

pub fn address_from_key(short_key_hash: ByteArray) -> Address {
  Address {
    payment_credential: VerificationKey(key_hash(short_key_hash)),
    stake_credential: None,
  }
}

pub fn script_address(script_hash: ByteArray) -> Address {
  Address { payment_credential: Script(script_hash), stake_credential: None }
}

pub fn stt_address(policy_id: ByteArray) -> Address {
  script_address(policy_id)
}

pub fn wallet_script_address() -> Address {
  script_address(#"bb")
}

pub fn transaction(
  validity_range: ValidityRange,
  extra_signatories: List<ByteArray>,
  inputs: List<Input>,
  outputs: List<Output>,
  id: ByteArray,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs,
    outputs,
    validity_range,
    extra_signatories: list.map(extra_signatories, key_hash),
    id,
  }
}

// Construct a transaction that also carries an STT spend redeemer in
// `redeemers`. Required when the wallet validator (or other consumers) read
// the STT redeemer to learn which action ran.
pub fn transaction_with_stt_redeemer(
  validity_range: ValidityRange,
  extra_signatories: List<ByteArray>,
  inputs: List<Input>,
  outputs: List<Output>,
  id: ByteArray,
  stt_input_reference: OutputReference,
  stt_action: state_types.SttAction,
) -> Transaction {
  let redeemer_data: Data = stt_action
  Transaction {
    ..placeholder,
    inputs,
    outputs,
    validity_range,
    extra_signatories,
    id,
    redeemers: [Pair(Spend(stt_input_reference), redeemer_data)],
  }
}

pub fn stt_value(policy_id: ByteArray, asset_name: ByteArray, lovelace: Int) {
  assets.merge(
    assets.from_lovelace(lovelace),
    assets.from_asset(policy_id, asset_name, 1),
  )
}

pub fn stt_input(
  own_ref: OutputReference,
  policy_id: ByteArray,
  state: state_types.State,
  value: assets.Value,
) -> Input {
  Input {
    output_reference: own_ref,
    output: Output {
      address: stt_address(policy_id),
      value,
      datum: InlineDatum(state),
      reference_script: None,
    },
  }
}

pub fn stt_output(
  policy_id: ByteArray,
  state: state_types.State,
  value: assets.Value,
) -> Output {
  Output {
    address: stt_address(policy_id),
    value,
    datum: InlineDatum(state),
    reference_script: None,
  }
}

pub fn wallet_input(own_ref: OutputReference, value: assets.Value) -> Input {
  external_input(own_ref, wallet_script_address(), value)
}

pub fn external_input(
  own_ref: OutputReference,
  address: Address,
  value: assets.Value,
) -> Input {
  Input {
    output_reference: own_ref,
    output: Output { address, value, datum: NoDatum, reference_script: None },
  }
}

pub fn wallet_output(value: assets.Value) -> Output {
  Output {
    address: wallet_script_address(),
    value,
    datum: NoDatum,
    reference_script: None,
  }
}

pub fn payout_output(address: Address, value: assets.Value) -> Output {
  Output { address, value, datum: NoDatum, reference_script: None }
}

// A continuing wallet output (same payment credential as `wallet_script_address`)
// carrying a chosen stake credential. Used to fuzz the wallet validator's
// "Franken-stake" defense: any continuing wallet output whose stake credential
// differs from the State's `intended_stake_credential` must be rejected.
pub fn wallet_output_with_stake(
  value: assets.Value,
  stake_credential: Option<Referenced<Credential>>,
) -> Output {
  Output {
    address: Address { ..wallet_script_address(), stake_credential },
    value,
    datum: NoDatum,
    reference_script: None,
  }
}

pub fn tagged_streaming_payment_output(
  address: Address,
  value: assets.Value,
  expected_ref: OutputReference,
  streaming_payment_id: Int,
) -> Output {
  Output {
    address,
    value,
    datum: InlineDatum(
      OutputId {
        id: streaming_payment_id,
        transaction_id: expected_ref.transaction_id,
        output_index: expected_ref.output_index,
      },
    ),
    reference_script: None,
  }
}

// Action constructors (replace the legacy `*_witness` helpers — the wallet
// payload now lives directly on the SttAction redeemer).
pub fn operator_use_action(
  operator_path: state_types.OperatorPath,
) -> state_types.SttAction {
  state_types.RunOperator(
    state_types.OperatorAction { path: operator_path, kind: state_types.Use },
  )
}

// The general form of `operator_use_action`, for the `UpdateState` /
// `ManageStreamingPayments` / `SetIntendedStakeCredential` kinds.
pub fn operator_action(
  path: state_types.OperatorPath,
  kind: state_types.OperatorActionKind,
) -> state_types.SttAction {
  state_types.RunOperator(state_types.OperatorAction { path, kind })
}

pub fn allowance_action(
  spent_allowance: state_types.AssetEntries,
) -> state_types.SttAction {
  state_types.UseAllowance(spent_allowance)
}

pub fn beneficiary_action(beneficiary_id: Int) -> state_types.SttAction {
  state_types.UseBeneficiary(beneficiary_id)
}

pub fn streaming_payment_action(
  payout_delta: state_types.AssetEntries,
) -> state_types.SttAction {
  state_types.PayStreamingPayment(payout_delta)
}

pub fn consolidation_action(
  consolidate_path: state_types.ConsolidatePath,
) -> state_types.SttAction {
  state_types.Consolidate(consolidate_path)
}

// Convenience: 2_000_000 lovelace + 1 STT token under the default policy/asset.
pub fn default_stt_value() -> assets.Value {
  stt_value(default_policy_id(), default_asset_name(), 2_000_000)
}

// Build a full STT spend transaction with an inline STT input/output pair on
// both sides carrying the default STT value (2_000_000 lovelace).
pub fn stt_spend_tx(
  validity_range: ValidityRange,
  extra_signatories: List<ByteArray>,
  input_state: state_types.State,
  output_state: state_types.State,
  extra_outputs: List<Output>,
  id: ByteArray,
) -> Transaction {
  stt_spend_tx_with_values(
    validity_range,
    extra_signatories,
    input_state,
    output_state,
    default_stt_value(),
    default_stt_value(),
    extra_outputs,
    id,
  )
}

// Variant that additionally sets the transaction's `mint` field — for tests
// pinning STT preservation against a spend that also mints/burns.
pub fn stt_spend_tx_with_mint(
  mint: assets.Value,
  validity_range: ValidityRange,
  extra_signatories: List<ByteArray>,
  input_state: state_types.State,
  output_state: state_types.State,
  input_stt_value: assets.Value,
  output_stt_value: assets.Value,
  extra_outputs: List<Output>,
  id: ByteArray,
) -> Transaction {
  let tx = stt_spend_tx_with_values(
    validity_range,
    extra_signatories,
    input_state,
    output_state,
    input_stt_value,
    output_stt_value,
    extra_outputs,
    id,
  )
  Transaction { ..tx, mint }
}

// Variant that lets a test pick custom STT input/output values (e.g. lovelace
// top-up).
pub fn stt_spend_tx_with_values(
  validity_range: ValidityRange,
  extra_signatories: List<ByteArray>,
  input_state: state_types.State,
  output_state: state_types.State,
  input_stt_value: assets.Value,
  output_stt_value: assets.Value,
  extra_outputs: List<Output>,
  id: ByteArray,
) -> Transaction {
  let input = stt_input(
    stt_input_ref(),
    default_policy_id(),
    input_state,
    input_stt_value,
  )
  let output_ = stt_output(default_policy_id(), output_state, output_stt_value)
  transaction(
    validity_range,
    extra_signatories,
    [input],
    [output_, ..extra_outputs],
    id,
  )
}
