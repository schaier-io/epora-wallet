use aiken/collection/dict
use aiken/collection/list
use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use state/configuration as state_configuration
use state/types as state_types
use stt/io.{
  TransitionContext, expect_minted_stt_state_and_asset_name,
  expect_transition_context, is_admin_operator_action,
  output_reference_to_asset_name,
}
use stt/spend_handlers.{
  eval_cancel_streaming_payment, eval_consolidate,
  eval_manage_streaming_payments, eval_operator_state_update, eval_operator_use,
  eval_pay_streaming_payment, eval_remove_access_index, eval_renew_proof_of_life,
  eval_set_intended_stake_credential, eval_use_allowance, eval_use_beneficiary,
}

validator stt {
  mint(redeemer: Data, policy_id: PolicyId, self: Transaction) {
    eval_mint(redeemer, policy_id, self)
  }

  spend(
    datum: Option<state_types.State>,
    redeemer: state_types.SttAction,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    eval_spend(datum, redeemer, own_ref, self)
  }

  // INTENTIONAL: the STT script handles only `mint` and `spend`. Every other
  // script purpose (`withdraw` / `publish` / `propose` / `vote`) is rejected, so
  // the STT UTxO never participates in staking or governance under its own script
  // credential. Acceptable because the STT UTxO holds only a min-ADA-tier deposit;
  // any forgone rewards are negligible (audit A5).
  else(_) {
    fail
  }
}

// Keep the testable bodies outside the parameterized validator entrypoints so
// other modules (tests, helper validators) can drive them directly. Mirrors
// the pattern in `wallet`.
pub fn eval_mint(
  _redeemer: Data,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  let Transaction { inputs, outputs, mint, .. } = self

  // Decode the freshly minted STT output and validate its state payload.
  let Pair(state, asset_name) = expect_minted_stt_state_and_asset_name(
    outputs,
    policy_id,
  )

  // The minted token name must be derived from one of the consumed inputs.
  let token_name_bound_to_spent_input = list.any(
    inputs,
    fn(input) {
      asset_name == output_reference_to_asset_name(input.output_reference)
    },
  )
  expect token_name_bound_to_spent_input
  // Validate the state payload.
  expect state_configuration.expect_valid_state_configuration(state)
  // A freshly minted wallet has no crank history, so the cooldown clock starts
  // empty. Pinning `None` here (not in `expect_valid_state_configuration`, which
  // also runs on `UpdateState` where the field must be PRESERVED) stops a creator
  // from seeding a far-future stamp that would block early permissionless cranks,
  // or a past one that is meaningless. See the whitepaper's Settlement-cadence
  // theorem.
  expect state.last_permissionless_payout_at == None
  // Directly pin the mint (audit I-5): exactly ONE token name under this policy,
  // equal to the `asset_name` on the continuing output, in quantity EXACTLY 1.
  // Stronger than the prior `dict.size == 1`, which only counted names and leaned
  // on the output-side quantity/derivation checks to rule out a wrong quantity or
  // a minted name that differs from the one the output carries.
  expect [Pair(minted_asset_name, minted_quantity)] = mint
    |> assets.tokens(policy_id)
    |> dict.to_pairs()
  expect minted_asset_name == asset_name
  minted_quantity == 1
}

pub fn eval_spend(
  _datum: Option<state_types.State>,
  redeemer: state_types.SttAction,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  // Build a shared view over the consumed and forwarded STT outputs.
  let context = expect_transition_context(own_ref, self)

  // Reference scripts on the forwarded STT output are forbidden except when
  // an admin operator action explicitly carries one (see
  // `is_admin_operator_action` for the rationale).
  let admin_carve_out = is_admin_operator_action(redeemer)
  let no_reference_script_attached = context.output_reference_script == None
  expect or {
      admin_carve_out,
      no_reference_script_attached,
    }

  // NOTE: the STT's stake credential needs no dedicated check here — the STT is
  // a singleton, and `expect_single_stt_io` locates the continuing output by
  // FULL address (payment + stake), so it is already pinned to the input's stake
  // credential and cannot be re-homed. See
  // `merged_stt_spend_rejects_rehomed_continuing_output_stake_credential`.
  // Every action EXCEPT the dedicated `SetIntendedStakeCredential` path must
  // PRESERVE `intended_stake_credential`. Enforcing it once here (rather than in
  // each per-action preservation helper) means no spend — and not even the
  // arbitrary `UpdateState` — can quietly re-target where wallet funds delegate;
  // only the admin/multisig set action below may change it.
  let is_set_intended_stake_credential = when redeemer is {
    state_types.RunOperator(op) ->
      when op.kind is {
        state_types.SetIntendedStakeCredential(_) -> True
        _ -> False
      }
    _ -> False
  }
  expect or {
      is_set_intended_stake_credential,
      context.input_state.intended_stake_credential == context.output_state.intended_stake_credential,
    }

  // Every action EXCEPT a `PayStreamingPayment` crank must PRESERVE
  // `last_permissionless_payout_at`. The crank is the only path allowed to touch
  // it, and even there only a PERMISSIONLESS crank advances it (to the tx upper
  // bound, enforcing the inter-crank cooldown); an AUTHORIZED crank leaves it
  // unchanged — see the Settlement-cadence theorem and
  // `eval_pay_streaming_payment`. Enforcing
  // preservation once here means no other transition — not even `UpdateState` —
  // can reset or advance the cooldown clock to weaken the next permissionless
  // crank's gate.
  let is_pay_streaming_payment = when redeemer is {
    state_types.PayStreamingPayment(_) -> True
    _ -> False
  }
  expect or {
      is_pay_streaming_payment,
      context.input_state.last_permissionless_payout_at == context.output_state.last_permissionless_payout_at,
    }

  // Dispatch per action variant. The per-action `eval_*` helpers (in
  // `lib/stt/spend_handlers.ak`) own all of the invariants for their branch —
  // keep eval_spend itself flat for readability.
  //
  // CO-FIRING INVARIANT: the wallet validator only runs when a wallet
  // UTxO is spent, so on a wallet-less tx its checks (reserve floor, movement
  // bound, payout routing, stake pinning) are ABSENT. Every branch below must
  // therefore fully contain its own safety on the STT side — no action's safety
  // may depend solely on the wallet validator. (Verified: a wallet-less
  // PayStreamingPayment is still pinned to the tagged payee output + exact delta
  // STT-side; the other wallet-spending actions are self-harm-only without a
  // wallet output.) See the whitepaper Formal Model — "The two validators" and
  // the Bounded-movement theorem (audit A2).
  when redeemer is {
    state_types.RunOperator(operator_action) ->
      when operator_action.kind is {
        state_types.Use -> eval_operator_use(operator_action, context)
        state_types.UpdateState ->
          eval_operator_state_update(operator_action, context)
        state_types.ManageStreamingPayments ->
          eval_manage_streaming_payments(operator_action, context)
        state_types.RemoveAccessIndex(target) ->
          eval_remove_access_index(target, operator_action, context)
        state_types.SetIntendedStakeCredential(target) ->
          eval_set_intended_stake_credential(target, operator_action, context)
      }
    state_types.RenewProofOfLife -> eval_renew_proof_of_life(context)
    state_types.UseAllowance(declared_spent_allowance) ->
      eval_use_allowance(declared_spent_allowance, context)
    state_types.UseBeneficiary(declared_beneficiary_id) ->
      eval_use_beneficiary(declared_beneficiary_id, context)
    state_types.PayStreamingPayment(declared_payout_delta) ->
      eval_pay_streaming_payment(declared_payout_delta, context)
    state_types.Consolidate(consolidate_path) ->
      eval_consolidate(consolidate_path, context)
    state_types.CancelStreamingPayment(declared_streaming_payment_id) ->
      eval_cancel_streaming_payment(declared_streaming_payment_id, context)
  }
}
