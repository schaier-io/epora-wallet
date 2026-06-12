use assets/entries as asset_entries
use cardano/address.{Address, Credential, Referenced, Script, VerificationKey}
use cardano/assets
use cardano/certificate.{Certificate, RegisterDelegateRepresentative}
use cardano/governance.{DelegateRepresentative, Voter}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Spend, Transaction,
  ValidityRange, placeholder,
}
use state/types as state_types
use streaming_payments/types.{OutputId, StreamingPayment}

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

pub fn stt_input_ref() {
  output_ref(
    #"5230000000000000000000000000000000000000000000000000000000000000",
    0,
  )
}

pub fn secondary_stt_input_ref() {
  output_ref(
    #"5330000000000000000000000000000000000000000000000000000000000000",
    1,
  )
}

pub fn wallet_input_ref() {
  output_ref(
    #"6230000000000000000000000000000000000000000000000000000000000000",
    0,
  )
}

pub fn secondary_wallet_input_ref() {
  output_ref(
    #"6330000000000000000000000000000000000000000000000000000000000000",
    1,
  )
}

pub fn address_from_key(key_hash: ByteArray) -> Address {
  Address {
    payment_credential: VerificationKey(key_hash),
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
    extra_signatories,
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

pub fn user(
  id: Int,
  wallets: List<ByteArray>,
  per_day_allowance: state_types.AssetEntries,
  remaining_allowance: state_types.AssetEntries,
  next_allowance_reset: Int,
  can_renew_proof_of_life: Bool,
  multi_sig_power: Option<Int>,
  is_admin: Bool,
) -> state_types.User {
  state_types.User {
    id,
    user_wallets: wallets,
    per_day_allowance,
    remaining_allowance,
    next_allowance_reset,
    can_renew_proof_of_life,
    multi_sig_power,
    is_admin,
  }
}

pub fn beneficiary(
  id: Int,
  wallets: List<ByteArray>,
  unlock_after: Option<Int>,
  weight: Int,
) -> state_types.Beneficiary {
  state_types.Beneficiary {
    id,
    beneficiary_wallets: wallets,
    unlock_after,
    weight,
  }
}

pub fn state(
  users: List<state_types.User>,
  multi_sig_threshold: Option<Int>,
  beneficiaries: List<state_types.Beneficiary>,
  unlock_time: Option<Int>,
  increment: Option<Int>,
  streaming_payments: List<StreamingPayment>,
) -> state_types.State {
  state_types.State {
    access: state_types.AccessControl {
      users,
      multi_sig_threshold,
      beneficiaries,
    },
    proof_of_life: state_types.ProofOfLifeSettings { unlock_time, increment },
    wallet_name: #"",
    streaming_payments,
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
}

pub fn streaming_payment(
  id: Int,
  payout_address: Address,
  paid_out_amount: Int,
  policy_id: ByteArray,
  asset_name: ByteArray,
  amount_per_day: Int,
  start_date: Int,
  end_date: Int,
) -> StreamingPayment {
  StreamingPayment {
    id,
    payout_address,
    paid_out_amount,
    policy_id,
    asset_name,
    amount_per_day,
    start_date,
    end_date,
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

// Common user/state constructors used across test modules.
pub fn admin_user(wallet: ByteArray) -> state_types.User {
  user(0, [wallet], [], [], 0, False, None, True)
}

pub fn renewing_user(id: Int, wallet: ByteArray) -> state_types.User {
  user(id, [wallet], [], [], 0, True, None, False)
}

pub fn multisig_user(id: Int, wallet: ByteArray, power: Int) -> state_types.User {
  user(id, [wallet], [], [], 0, False, Some(power), False)
}

// 1_000_000-lovelace-per-day allowance user. Callers pick remaining_allowance
// (lovelace) and next_allowance_reset (POSIX ms) so tests can express both
// "fresh" and "partially-spent / reset-shifted" states.
pub fn allowance_user(
  id: Int,
  wallet: ByteArray,
  remaining_allowance: Int,
  next_allowance_reset: Int,
  can_renew_proof_of_life: Bool,
) -> state_types.User {
  let per_day = assets.from_lovelace(1_000_000)
    |> asset_entries.flatten_to_entries
  user(
    id,
    [wallet],
    per_day,
    assets.from_lovelace(remaining_allowance)
      |> asset_entries.flatten_to_entries,
    next_allowance_reset,
    can_renew_proof_of_life,
    None,
    False,
  )
}

// `beneficiary` shortcut that fills the audit defaults (single wallet,
// weight 1). Most tests want exactly these.
pub fn default_beneficiary(
  id: Int,
  wallet: ByteArray,
  unlock_after: Option<Int>,
) -> state_types.Beneficiary {
  beneficiary(id, [wallet], unlock_after, 1)
}

// A 2-of-N state with a 100/50 proof-of-live schedule. Used by most STT
// transition-rule tests.
pub fn secured_state(
  users: List<state_types.User>,
  beneficiaries: List<state_types.Beneficiary>,
  streaming_payments: List<StreamingPayment>,
) -> state_types.State {
  state(users, Some(2), beneficiaries, Some(100), Some(50), streaming_payments)
}

// A single-admin state with one streaming_payment paid `streaming_payment_paid` of its
// 1_000_000/day to "beneficiary1". The wallet streaming_payment-payout tests use
// this as the canonical input/output state.
pub fn streaming_payment_payout_state(
  streaming_payment_paid: Int,
) -> state_types.State {
  state(
    [admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [
      streaming_payment(
        1,
        address_from_key("beneficiary1"),
        streaming_payment_paid,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  )
}

// Two-streaming_payment variant: streaming_payment 1 to "beneficiary1" with
// `first_streaming_payment_paid`, streaming_payment 2 to "beneficiary2" with 0 paid.
// Used by tests that probe payout-routing rules across multiple recipients.
pub fn two_streaming_payment_payout_state(
  first_streaming_payment_paid: Int,
) -> state_types.State {
  state(
    [admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [
      streaming_payment(
        1,
        address_from_key("beneficiary1"),
        first_streaming_payment_paid,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
      streaming_payment(
        2,
        address_from_key("beneficiary2"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  )
}

pub fn sample_certificate() -> Certificate {
  RegisterDelegateRepresentative {
    delegate_representative: VerificationKey(#"ca"),
    deposit: 2_000_000,
  }
}

pub fn sample_credential() -> Credential {
  VerificationKey(#"cc")
}

pub fn sample_voter() -> Voter {
  DelegateRepresentative(VerificationKey(#"ca"))
}
