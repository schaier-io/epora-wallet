//// The wallet validator — guards the wallet's funds. It only fires co-spent
//// with the STT: it reads the forwarded STT `State` and the STT spend redeemer
//// from `tx.redeemers`, then bounds wallet movement against the `SttAction`
//// the STT validator already proved consistent with the state diff — per-action
//// movement bounds (`lib/wallet/rules.ak`), the streaming-payment reserve floor
//// (`lib/streaming_payments/funding.ak`), payout routing
//// (`lib/wallet/payout_routing.ak`), and the intended-stake-credential pin on
//// every continuing wallet output (`lib/wallet/stake_pinning.ak`). The
//// forwarded-STT decode and the value snapshot live in `lib/wallet/io.ak` —
//// this module only orchestrates. Per-path interaction map and audit
//// checklist: INTERACTIONS.md.

use cardano/address.{Credential}
use cardano/assets.{PolicyId}
use cardano/certificate.{Certificate}
use cardano/governance.{Voter}
use cardano/transaction.{OutputReference, Transaction, find_input}
use state/types as state_types
use streaming_payments/funding as streaming_payment_funding
use time/bounds
use wallet/io.{collect_wallet_value_snapshot, expect_forwarded_stt_output}
use wallet/payout_routing.{OutputContext}
use wallet/rules as wallet_rules
use wallet/stake_pinning.{expect_wallet_outputs_use_intended_stake}

validator wallet(stt_policy_id: PolicyId, asset_name: ByteArray) {
  spend(
    datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    eval_spend(stt_policy_id, asset_name, datum, redeemer, own_ref, self)
  }

  // withdraw/publish/vote share ONE gate — `eval_governance_operator_use` — and
  // ignore their purpose-specific payload (see that function's comment). Each
  // purpose calls it directly; there is deliberately no per-purpose wrapper.
  withdraw(
    operator_path: state_types.OperatorPath,
    _account: Credential,
    self: Transaction,
  ) {
    eval_governance_operator_use(stt_policy_id, asset_name, operator_path, self)
  }

  mint(redeemer: Data, policy_id: PolicyId, self: Transaction) {
    eval_mint(stt_policy_id, asset_name, redeemer, policy_id, self)
  }

  publish(
    operator_path: state_types.OperatorPath,
    _certificate: Certificate,
    self: Transaction,
  ) {
    eval_governance_operator_use(stt_policy_id, asset_name, operator_path, self)
  }

  // Conway voting purpose: when the wallet's own credential is a registered
  // DRep / SPO / constitutional-committee member casting a governance vote, gate
  // it through the same operator-Use handshake as the other governance
  // entrypoints. (audit F-9: this REPLACES the `propose` purpose. A personal
  // wallet never needs its own proposing/guardrails script — proposing a
  // governance action needs only a refundable deposit + spend authorization, not
  // a wallet-side propose handler — whereas `vote` is the only way a script
  // wallet can cast a vote. aiken v1.1.22 also hard-crashes compiling 6 purpose
  // handlers on this validator (upstream FreeUnique bug, issue #361), so the
  // wallet supports 5. Voting still requires this hash to be a registered DRep/CC
  // first — that registration certificate runs through `publish`.)
  vote(
    operator_path: state_types.OperatorPath,
    _voter: Voter,
    self: Transaction,
  ) {
    eval_governance_operator_use(stt_policy_id, asset_name, operator_path, self)
  }

  else(_) {
    fail
  }
}

/// Keep testable wallet logic outside the parameterized validator entrypoints to
/// avoid the Aiken interner crash triggered by in-module validator tests.
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
  expect Some(own_input) = self.inputs
    |> find_input(own_ref)

  let wallet_address = own_input.output.address

  // Read the forwarded STT state and the wallet's value delta.
  let forwarded_stt_state = expect_forwarded_stt_output(
    policy_id,
    asset_name,
    self,
  )
  let wallet_values = collect_wallet_value_snapshot(
    self.inputs,
    outputs,
    wallet_address,
  )

  // Every continuing wallet output must carry the State's intended stake
  // credential (read from the forwarded STT output datum). This stops any spend
  // — including the permissionless `PayStreamingPayment` crank — from re-homing
  // wallet funds under a foreign ("Franken") stake credential to hijack their
  // delegation/rewards or hide them from address-based discovery. Wallet INPUTS
  // are intentionally NOT constrained (they aggregate by payment credential), so
  // legacy/out-of-sync UTxOs at a stale stake credential can be swept back to the
  // intended one. Changed only via the admin/multisig `SetIntendedStakeCredential`.
  expect
    expect_wallet_outputs_use_intended_stake(
      outputs,
      wallet_address.payment_credential,
      forwarded_stt_state.output_state.intended_stake_credential,
    )

  // No spend may move an asset OUT below what that asset's streaming-payment
  // payees are still owed. The check is PER ASSET and spent-only
  // (`output >= min(input, reserve)`, see `lib/streaming_payments/funding.ak`):
  // spending one asset is never blocked by a payment denominated in another, and
  // a payment in an asset the wallet does not hold never blocks anything.
  // Value-preserving Consolidation (`input_value == output_value`) passes
  // trivially, since every asset's output equals its input — no special case.
  expect Some(tx_latest_time) = bounds.finite_upper(validity_range)
  expect
    streaming_payment_funding.expect_remain_funded(
      forwarded_stt_state.output_state,
      wallet_values.input_value,
      wallet_values.output_value,
      tx_latest_time,
    )

  // Reserve owed to streaming-payment payees, subtracted from the pool a
  // beneficiary may draw against. Computed on the output state, which carries
  // the same streaming payments (UseBeneficiary does not change them).
  let streaming_reserve = streaming_payment_funding.calculate_streaming_reserve(
    forwarded_stt_state.output_state.streaming_payments,
    tx_latest_time,
  )

  // The wallet can only spend when the STT action authorizes it.
  expect
    wallet_rules.stt_action_allows_spend(
      forwarded_stt_state.stt_action,
      forwarded_stt_state.input_state,
      wallet_values,
      streaming_reserve,
      OutputContext {
        wallet_address,
        stt_input_reference: forwarded_stt_state.stt_input_reference,
        stt_address: forwarded_stt_state.stt_address,
        outputs,
      },
    )
  True
}

/// The single authorization gate shared by all three governance purposes
/// (withdraw / publish / vote): the STT must have run an operator `Use` action on
/// the matching path. Each purpose's entrypoint calls this directly and ignores
/// its purpose-specific payload (`account` / `certificate` / `voter`) — the STT
/// is the only authorization surface, and the off-chain transaction is trusted to
/// embed the right action. Those payloads differ only because Cardano requires a
/// distinct entrypoint signature per purpose; the authorization logic is one
/// definition, here, not copied per purpose.
///
/// CONSEQUENCE (audit I-3, intentional): gating these to operator `Use` makes
/// staking-reward withdrawal and governance OPERATOR-ONLY. A beneficiary
/// recovering the wallet receives the wallet UTxOs but CANNOT withdraw the
/// reward account's accrued staking rewards (that needs an operator `Use`).
/// Accepted because the default wallet is an enterprise address
/// (`intended_stake_credential = None`) with no staking, so rewards accrue only
/// if an operator deliberately enables script-staking — at which point they are
/// part of the operator-controlled surface by design.
pub fn eval_governance_operator_use(
  policy_id: PolicyId,
  asset_name: ByteArray,
  operator_path: state_types.OperatorPath,
  self: Transaction,
) -> Bool {
  let forwarded_stt_state = expect_forwarded_stt_output(
    policy_id,
    asset_name,
    self,
  )
  expect
    forwarded_stt_state.stt_action == state_types.RunOperator(
      state_types.OperatorAction { path: operator_path, kind: state_types.Use },
    )
  True
}

/// The wallet validator intentionally refuses every mint attempt. Wallet
/// UTxOs do not own a minting policy — the only minted asset that may sit at
/// the wallet is the STT, which is governed by `validators/stt.ak`. The
/// entrypoint exists so the wallet script's policy id is well-defined (every
/// validator must specify what happens on each script purpose), but minting
/// here is always invalid.
pub fn eval_mint(
  _policy_id: PolicyId,
  _asset_name: ByteArray,
  _redeemer: Data,
  _mint_policy_id: PolicyId,
  _self: Transaction,
) {
  False
}
