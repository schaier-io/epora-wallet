//// Wallet entrypoints: spend delegates to `wallet/spend`; withdraw, publish,
//// and vote share the operator-Use gate below. Mint and other purposes reject.
//// Read INTERACTIONS.md for the STT handshake and per-action audit checklist.

use cardano/address.{Credential}
use cardano/assets.{PolicyId}
use cardano/certificate.{Certificate}
use cardano/governance.{Voter}
use cardano/transaction.{OutputReference, Transaction}
use state/types as state_types
use transaction_shape
use wallet/io.{expect_forwarded_stt_output}
use wallet/spend as wallet_spend

validator wallet(stt_policy_id: PolicyId, asset_name: ByteArray) {
  spend(
    datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    wallet_spend.eval_spend(
      stt_policy_id,
      asset_name,
      datum,
      redeemer,
      own_ref,
      self,
    )
  }

  // Governance purposes share the same operator-Use authorization gate.
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

  // Voting uses the wallet credential and the same operator-Use handshake.
  // REPORTED (prior review): a sixth purpose handler failed on Aiken v1.1.23
  // without a diagnostic (upstream issue #361). Recheck before adding one.
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

/// Require operator Use on the requested path for withdrawal, publication,
/// and voting. Purpose-specific payloads do not change this authorization.
/// Beneficiary recovery controls wallet funds but does not grant access to
/// staking rewards or governance. See the whitepaper's operator-only caveat.
pub fn eval_governance_operator_use(
  policy_id: PolicyId,
  asset_name: ByteArray,
  operator_path: state_types.OperatorPath,
  self: Transaction,
) -> Bool {
  expect transaction_shape.governance_is_bounded(self)
  let _input, _output, stt_action, _reference, _address <- expect_forwarded_stt_output(
    policy_id,
    asset_name,
    self,
  )
  expect
    stt_action == state_types.RunOperator(
      state_types.OperatorAction { path: operator_path, kind: state_types.Use },
    )
  True
}

/// Always reject minting under the wallet's own policy id.
pub fn eval_mint(
  _policy_id: PolicyId,
  _asset_name: ByteArray,
  _redeemer: Data,
  _mint_policy_id: PolicyId,
  _self: Transaction,
) {
  False
}
