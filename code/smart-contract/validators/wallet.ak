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
use wallet/stake_pinning.{expect_wallet_outputs_are_well_formed}

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
  // wallet can cast a vote. Voting still requires this hash to be a registered
  // DRep/CC first — that registration certificate runs through `publish`.
  //
  // The compiler constraint is ALSO still live: adding a 6th purpose handler to
  // this validator makes `aiken check`/`aiken build` exit non-zero with NO
  // diagnostic (upstream FreeUnique bug, issue #361). Re-verified on the pinned
  // toolchain v1.1.23 during the 2026-07 security review — the bug was reported
  // against v1.1.22 and is not fixed. Re-test before adding a purpose.)
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
  // credential (read from the forwarded STT output datum) and no reference
  // script. This stops any spend — including the `PayStreamingPayment` crank,
  // whose submitter need not be the owner — from re-homing
  // wallet funds under a foreign ("Franken") stake credential to hijack their
  // delegation/rewards or hide them from address-based discovery. Wallet INPUTS
  // are intentionally NOT constrained (they aggregate by payment credential), so
  // legacy/out-of-sync UTxOs at a stale stake credential can be swept back to the
  // intended one. Changed only via the admin/multisig `SetIntendedStakeCredential`.
  expect
    expect_wallet_outputs_are_well_formed(
      outputs,
      wallet_address.payment_credential,
      forwarded_stt_state.output_state.intended_stake_credential,
    )

  // Reserve owed to streaming-payment payees as of the tx upper bound. Computed
  // ONCE from the output state and used twice below: as the floor no spend may
  // push the wallet under, and as the amount subtracted from the pool a
  // beneficiary may draw against. (`UseBeneficiary` does not change the payment
  // set, so input and output carry the same one.)
  expect Some(tx_latest_time) = bounds.finite_upper(validity_range)
  let streaming_reserve = streaming_payment_funding.calculate_streaming_reserve(
    forwarded_stt_state.output_state.streaming_payments,
    tx_latest_time,
  )

  // No spend may move an asset OUT below what that asset's streaming-payment
  // payees are still owed. The check is PER ASSET and spent-only
  // (`output >= min(input, reserve)`, see `lib/streaming_payments/funding.ak`):
  // spending one asset is never blocked by a payment denominated in another, and
  // a payment in an asset the wallet does not hold never blocks anything.
  // Value-preserving Consolidation (`input_value == output_value`) passes
  // trivially, since every asset's output equals its input — no special case.
  //
  // `PayStreamingPayment` is EXEMPT, and must be. This gate is a floor on what
  // may LEAVE discretionarily; the crank is the one action whose outflow is
  // already pinned, asset for asset, to the tagged payee outputs
  // (`paid_out_value == payout_delta` plus `assets_only_reach_matching_outputs`
  // in `lib/wallet/rules.ak`), so it can never underfund anyone and needs no
  // floor. Applying the floor to it was a DEADLOCK: for an under-funded wallet
  // (`0 < input <= reserve`) `min` collapses to `input`, forbidding every
  // outflow — including the settlement, the only action that can shrink the
  // reserve — so the asset froze permanently for payee, operator and beneficiary
  // alike while `accrued_at` kept growing. Reachable simply by spending down to
  // the reserve and waiting one block.
  //
  // CONSEQUENCE (documented, whitepaper "Under-funded settlement"): when a wallet
  // cannot cover everything it owes, settlement is first-come-first-served across
  // payees rather than pro-rata. Each payment is still individually capped at its
  // own accrual, so no payee can be paid more than it earned.
  expect or {
      state_types.is_pay_streaming_payment_action(
        forwarded_stt_state.stt_action,
      ),
      streaming_payment_funding.remains_funded(
        streaming_reserve,
        wallet_values.input_value,
        wallet_values.output_value,
      ),
    }

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
