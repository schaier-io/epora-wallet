use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Address, Credential, Inline, Referenced}
use cardano/assets.{PolicyId, quantity_of}
use cardano/certificate.{Certificate}
use cardano/governance.{Voter}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Spend, Transaction, find_input,
}
use state/types as state_types
use streaming_payments/funding as streaming_payment_funding
use time/bounds
use wallet/rules as wallet_rules

type ForwardedSttState {
  input_state: state_types.State,
  output_state: state_types.State,
  stt_action: state_types.SttAction,
  stt_input_reference: OutputReference,
  stt_address: Address,
}

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

  // Reserve owed to streaming-payment recipients, subtracted from the pool a
  // beneficiary may draw against. Computed on the output state, which carries
  // the same streaming payments (UseBeneficiary does not change them).
  let streaming_reserve = streaming_payment_funding.calculate_minimum_output_value(
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
      wallet_rules.OutputContext {
        wallet_address,
        stt_input_reference: forwarded_stt_state.stt_input_reference,
        stt_address: forwarded_stt_state.stt_address,
        outputs,
      },
    )
  True
}

// Every continuing wallet output (matched by payment credential — the same
// aggregation key used for value) must carry the intended stake credential.
// Outputs to OTHER addresses (streaming-payment payees, beneficiaries, the
// spender's own change) are unconstrained — only funds RETURNING to the wallet
// are pinned.
fn expect_wallet_outputs_use_intended_stake(
  outputs: List<Output>,
  wallet_payment_credential: Credential,
  intended_stake_credential: Option<Credential>,
) -> Bool {
  list.all(
    outputs,
    fn(output) {
      if output.address.payment_credential == wallet_payment_credential {
        output_stake_matches_intended(
          output.address.stake_credential,
          intended_stake_credential,
        )?
      } else {
        True
      }
    },
  )
}

// A wallet output's stake credential matches the intended one: both absent
// (enterprise address), or both an INLINE credential that is equal. A pointer
// stake credential, or any None/Some mismatch, is rejected.
fn output_stake_matches_intended(
  output_stake_credential: Option<Referenced<Credential>>,
  intended_stake_credential: Option<Credential>,
) -> Bool {
  when (output_stake_credential, intended_stake_credential) is {
    (None, None) -> True
    (Some(Inline(output_credential)), Some(intended_credential)) ->
      output_credential == intended_credential
    _ -> False
  }
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
fn expect_forwarded_stt_output(
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

// Snapshot the wallet's input, output, and paid-out values across every UTxO whose payment
// credential matches the consumed wallet input. Matching by payment credential (instead of the
// full Address) aggregates value consistently even when wallet UTxOs exist at multiple stake
// credentials under the same script hash, which prevents a per-invocation cap (the beneficiary
// weighted-share bound) from being applied K times across K stake variants in the same transaction.
fn collect_wallet_value_snapshot(
  inputs: List<Input>,
  outputs: List<Output>,
  wallet_address: Address,
) -> wallet_rules.WalletValueSnapshot {
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

  wallet_rules.WalletValueSnapshot {
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
