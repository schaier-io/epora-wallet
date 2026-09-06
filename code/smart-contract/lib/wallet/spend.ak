//// Wallet spend orchestration: choose the group leader, read the STT transition,
//// pin continuing outputs, preserve reserves, and enforce the action's movement.
//// The validator entrypoint and integration tests call this implementation.

use aiken/collection/list
use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use state/types as state_types
use time/bounds
use wallet/io.{
  collect_wallet_value_snapshot, expect_forwarded_stt_output,
  wallet_input_leader_reference,
}
use wallet/payout_routing.{OutputContext}
use wallet/reserve
use wallet/rules as wallet_rules
use wallet/stake_pinning.{expect_wallet_outputs_are_well_formed}
use wallet/terminal_recovery

/// Validate one wallet input. The least reference validates its complete group;
/// other inputs defer to that leader. Wallet datum and redeemer are unused.
pub fn eval_spend(
  policy_id: PolicyId,
  asset_name: ByteArray,
  _datum: Option<Data>,
  _redeemer: Data,
  own_ref: OutputReference,
  self: Transaction,
) {
  let Transaction { outputs, validity_range, .. } = self

  // Resolve the wallet address from the consumed wallet input.
  let own_input = list.expect_find(
    self.inputs,
    fn(input) { input.output_reference == own_ref },
  )

  let wallet_address = own_input.output.address
  let leader_reference = wallet_input_leader_reference(
    self.inputs,
    wallet_address.payment_credential,
    own_ref,
  )

  // The least output reference is the unique leader that runs the full
  // aggregate validation. Other inputs can return because the ledger also
  // evaluates that leader for the same script.
  if own_ref != leader_reference {
    True
  } else {
    // Read the forwarded STT state and the wallet's value delta once for the
    // complete payment-credential group.
    let input_state, output_state, stt_action, stt_input_reference, stt_address
      <- expect_forwarded_stt_output(policy_id, asset_name, self)
    let streaming_payments = output_state.streaming_payments
    let repeatable_beneficiary_recovery = when stt_action is {
      state_types.UseBeneficiary(_) ->
        terminal_recovery.is_repeatable_beneficiary_recovery(input_state)
      _ -> False
    }

    // Wallet asset density has no application cap. Ledger byte size and
    // combined ExUnits still bound each transaction. Weighted beneficiary
    // shares and the streaming reserve remain checked below.
    let wallet_values = collect_wallet_value_snapshot(
      self.inputs,
      outputs,
      wallet_address,
    )

    // Pin continuing outputs to the intended stake credential. Inputs remain
    // grouped by payment credential so Consolidation can repair stale staking.
    expect
      expect_wallet_outputs_are_well_formed(
        outputs,
        wallet_address.payment_credential,
        output_state.intended_stake_credential,
      )

    expect Some(tx_latest_time) = bounds.finite_upper(validity_range)
    let streaming_reserve, spent_wallet_assets <- reserve.expect_reserve_preserved(
      stt_action,
      streaming_payments,
      repeatable_beneficiary_recovery,
      wallet_values,
      tx_latest_time,
    )

    // The wallet can only spend when the STT action authorizes it.
    expect
      wallet_rules.stt_action_allows_spend(
        stt_action,
        input_state,
        repeatable_beneficiary_recovery,
        wallet_values,
        streaming_reserve,
        spent_wallet_assets,
        OutputContext {
          wallet_address,
          stt_input_reference,
          stt_address,
          outputs,
        },
      )
    True
  }
}
