//// Shared, pure-data builders for the wallet test suites. Everything here
//// either constructs `Transaction`/`State`/`Input`/`Output`/`Beneficiary`
//// values or drives the `wallet/rules` library — none of it touches the
//// `wallet` validator (lib modules must not import a validator).

use aiken/collection/list
use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Input, Output, Transaction, ValidityRange}
use state/types as state_types
use test_support/security_fixtures as fixtures
use wallet/io.{WalletValueSnapshot}
use wallet/payout_routing.{OutputContext}
use wallet/rules as wallet_rules

// Rule-level adapter: drives `stt_action_allows_spend` with the given state,
// an empty streaming reserve, and the default fixture addresses/reference —
// the shape almost every rule-level test wants. `stt_action_allows_spend`
// reads only the input state (the beneficiary branch reads the acting
// beneficiary and the weight total from it; the streaming-payout branch
// matches against the input streaming set). Tests that exercise the streaming
// reserve or a custom address/reference call
// `wallet_rules.stt_action_allows_spend` directly.
pub fn allows_spend(
  action: state_types.SttAction,
  state: state_types.State,
  wallet_values: WalletValueSnapshot,
  outputs: List<Output>,
) -> Bool {
  wallet_rules.stt_action_allows_spend(
    action,
    state,
    wallet_values,
    assets.zero,
    OutputContext {
      wallet_address: fixtures.wallet_script_address(),
      stt_input_reference: fixtures.stt_input_ref(),
      stt_address: fixtures.stt_address(fixtures.default_policy_id()),
      outputs,
    },
  )
}

// `WalletValueSnapshot` for the single-input/single-output wallet shape.
// Tests where the UTxO counts are the point (fragmentation / merge /
// full-sweep) keep an explicit record literal instead.
pub fn snapshot(
  input_value: assets.Value,
  output_value: assets.Value,
  paid_out_value: assets.Value,
) -> WalletValueSnapshot {
  WalletValueSnapshot {
    input_value,
    output_value,
    paid_out_value,
    input_count: 1,
    output_count: 1,
  }
}

pub fn mk_beneficiary(id: Int, weight: Int) -> state_types.Beneficiary {
  fixtures.beneficiary(id, ["beneficiary1"], Some(100), weight)
}

pub fn empty_state() -> state_types.State {
  fixtures.state([], None, [], None, None, [])
}

pub fn stt_input_with_state(state: state_types.State) -> Input {
  fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
}

pub fn stt_output_with_state(state: state_types.State) -> Output {
  fixtures.stt_output(
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
}

// Build a wallet-spend transaction that also carries the STT spend redeemer
// the wallet validator now reads to learn which action ran.
pub fn wallet_spend_tx(
  validity_range: ValidityRange,
  output_state: state_types.State,
  stt_action: state_types.SttAction,
  wallet_output: Output,
  extra_outputs: List<Output>,
) -> Transaction {
  let stt_input = stt_input_with_state(output_state)
  let stt_output = stt_output_with_state(output_state)

  fixtures.transaction_with_stt_redeemer(
    validity_range,
    [],
    [
      stt_input,
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(2_000_000),
      ),
    ],
    [stt_output, wallet_output, ..extra_outputs],
    #"4030000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    stt_action,
  )
}

pub fn forwarded_only_tx(
  output_state: state_types.State,
  stt_action: state_types.SttAction,
  id: ByteArray,
) -> Transaction {
  fixtures.transaction_with_stt_redeemer(
    interval.after(0),
    [],
    [stt_input_with_state(output_state)],
    [stt_output_with_state(output_state)],
    id,
    fixtures.stt_input_ref(),
    stt_action,
  )
}

pub fn reserve_state_with_sp(
  sp_policy: ByteArray,
  sp_name: ByteArray,
) -> state_types.State {
  let sp = fixtures.streaming_payment(
    1,
    fixtures.address_from_key("payee"),
    0,
    sp_policy,
    sp_name,
    1000,
    0,
    10_000_000,
  )
  fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [sp],
  )
}

pub fn admin_use_reserve_tx(
  input_state: state_types.State,
  wallet_in_value: assets.Value,
  wallet_return_value: assets.Value,
) -> Transaction {
  let stt_in = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    input_state,
    fixtures.default_stt_value(),
  )
  let stt_out = fixtures.stt_output(
    fixtures.default_policy_id(),
    input_state,
    fixtures.default_stt_value(),
  )
  let wallet_in = fixtures.wallet_input(
    fixtures.wallet_input_ref(),
    wallet_in_value,
  )
  let wallet_return = fixtures.wallet_output(wallet_return_value)
  fixtures.transaction_with_stt_redeemer(
    interval.between(50, 100),
    ["admin"],
    [stt_in, wallet_in],
    [stt_out, wallet_return],
    #"e130000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.operator_use_action(state_types.Admin),
  )
}

pub fn streaming_payment_payout_tx(
  wallet_outputs: List<Output>,
  extra_outputs: List<Output>,
  delta: Int,
  id: ByteArray,
) -> Transaction {
  let input_state = fixtures.streaming_payment_payout_state(0)
  let output_state = fixtures.streaming_payment_payout_state(delta)
  let payout_delta = assets.from_lovelace(delta)
    |> asset_entries.flatten_to_entries
  let stt_input = stt_input_with_state(input_state)
  let stt_output = stt_output_with_state(output_state)

  fixtures.transaction_with_stt_redeemer(
    interval.between(86_400_000, 86_400_000),
    [],
    [
      stt_input,
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(2_000_000),
      ),
    ],
    list.concat([stt_output, ..wallet_outputs], extra_outputs),
    id,
    fixtures.stt_input_ref(),
    fixtures.streaming_payment_action(payout_delta),
  )
}

pub fn two_streaming_payment_payout_tx(
  wallet_outputs: List<Output>,
  extra_outputs: List<Output>,
  delta: Int,
  id: ByteArray,
) -> Transaction {
  let input_state = fixtures.two_streaming_payment_payout_state(0)
  let output_state = fixtures.two_streaming_payment_payout_state(delta)
  let payout_delta = assets.from_lovelace(delta)
    |> asset_entries.flatten_to_entries
  let stt_input = stt_input_with_state(input_state)
  let stt_output = stt_output_with_state(output_state)

  fixtures.transaction_with_stt_redeemer(
    interval.between(86_400_000, 86_400_000),
    [],
    [
      stt_input,
      fixtures.wallet_input(
        fixtures.wallet_input_ref(),
        assets.from_lovelace(3_000_000),
      ),
    ],
    list.concat([stt_output, ..wallet_outputs], extra_outputs),
    id,
    fixtures.stt_input_ref(),
    fixtures.streaming_payment_action(payout_delta),
  )
}
