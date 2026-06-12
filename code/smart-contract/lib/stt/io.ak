//// STT input/output plumbing shared by every spend handler: locating the
//// consumed STT and its single continuing output, decoding both inline `State`
//// datums, deriving the unique mint asset name, and the value-preservation gate.
////
//// Extracted from `validators/stt.ak` so the validator file holds the per-action
//// decision logic while this module owns the UTxO-decoding boilerplate. All
//// functions are pure and unit-tested directly by the `stt_*_tests` siblings.

use aiken/builtin.{blake2b_256}
use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash}
use aiken/primitive/bytearray.{concat, from_int_big_endian}
use cardano/address.{Script}
use cardano/assets.{PolicyId, policies}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, ValidityRange,
}
use state/types as state_types

/// Shared per-spend facts. Computed once by `expect_transition_context` and
/// passed to every per-action handler so they can stay free of UTxO-decoding
/// boilerplate.
pub type TransitionContext {
  transaction: Transaction,
  validity_range: ValidityRange,
  input_reference: OutputReference,
  transaction_outputs: List<Output>,
  input_stt_value: assets.Value,
  output_stt_value: assets.Value,
  input_state: state_types.State,
  output_state: state_types.State,
  /// Reference script attached to the forwarded STT output. Almost always
  /// must be `None` (see `is_admin_operator_action` carve-out below for the
  /// admin exception that lets an admin re-host the STT reference script).
  output_reference_script: Option<ScriptHash>,
}

// Find the minted STT output, confirm it stays at the STT script, and decode its state datum.
// `pub` so the extracted `stt_*_tests.ak` sibling modules can unit-test this
// core IO/validation invariant directly (white-box).
pub fn expect_minted_stt_state_and_asset_name(
  outputs: List<Output>,
  policy_id: PolicyId,
) -> Pair<state_types.State, ByteArray> {
  let policy_outputs = outputs
    |> list.filter(fn(output) { list.has(policies(output.value), policy_id) })

  // Exactly one STT output, carrying exactly one token, must be produced.
  expect [stt_output] = policy_outputs
  let stt_tokens = stt_output.value |> assets.tokens(policy_id)
  expect dict.size(stt_tokens) == 1
  expect [Pair(asset_name, quantity)] = stt_tokens |> dict.to_pairs()
  expect quantity == 1

  // Output must remain at the STT script and must not carry a reference
  // script — mint is the bootstrap path, never an admin upgrade, so we keep
  // the strict rule here without the admin carve-out that applies on spend.
  expect Script(actual_policy_id) = stt_output.address.payment_credential
  expect actual_policy_id == policy_id
  // The STT output must be an ENTERPRISE address (no stake credential). Spends
  // forward the STT by FULL address (`expect_single_stt_io`), so whatever stake
  // credential the mint sets is immutable for the wallet's lifetime (audit B-4):
  // a foreign credential would capture the deposit's delegation forever. Pinning
  // `None` here also makes every STT under this policy share ONE full address,
  // so the "exactly one STT input per tx" filter in `expect_single_stt_io` is a
  // per-policy singleton guard, not just a per-stake-variant one (audit B-1).
  // Matches the off-chain build (`resolveScriptAddress` → enterprise).
  expect stt_output.address.stake_credential == None
  expect stt_output.reference_script == None

  // The STT output must carry an inline State datum.
  expect InlineDatum(datum) = stt_output.datum
  expect state: state_types.State = datum
  Pair(state, asset_name)
}

// Resolve the consumed STT input together with the single continuing output.
// Refuses transactions that consume more than one input at the STT address
// (defends against attacker-supplied second STT UTxO at the same script) or
// that fail to forward a single continuing STT output.
pub fn expect_single_stt_io(
  own_ref: OutputReference,
  self: Transaction,
) -> Pair<Input, Output> {
  let Transaction { inputs, outputs, .. } = self

  expect Some(input_utxo) = list.find(
    inputs,
    fn(input) { input.output_reference == own_ref },
  )

  // Exactly one consumed input may sit at the STT script address.
  expect [_only_input_at_stt_address] = inputs
    |> list.filter(
        fn(input) { input.output.address == input_utxo.output.address },
      )

  // Exactly one continuing output may sit at the STT script address.
  expect [output_utxo] = outputs
    |> list.filter(fn(output) { output.address == input_utxo.output.address })

  Pair(input_utxo, output_utxo)
}

// STT asset names are derived from the spent output reference to make them unique.
// `pub` so the mint-test sibling can assert asset-name derivation directly.
pub fn output_reference_to_asset_name(
  output_reference: OutputReference,
) -> ByteArray {
  concat(
    output_reference.transaction_id,
    from_int_big_endian(output_reference.output_index, 4),
  )
    |> blake2b_256
}

// Gather the shared transaction facts used by every STT spend rule. Composed
// of three smaller helpers so each invariant is easy to locate and unit-test.
pub fn expect_transition_context(
  own_ref: OutputReference,
  self: Transaction,
) -> TransitionContext {
  let Transaction { outputs, validity_range, .. } = self

  let Pair(input_utxo, output_utxo) = expect_single_stt_io(own_ref, self)

  // The single STT token (same policy + asset name) must be forwarded
  // unchanged from input → output, and the output must remain locked at the
  // STT script.
  expect expect_stt_token_is_forwarded_unchanged(input_utxo.output, output_utxo)

  // Decode the inline State datum on both sides so handlers can compare them.
  let Pair(input_state, output_state) = expect_inline_states(
    input_utxo.output,
    output_utxo,
  )

  TransitionContext {
    transaction: self,
    validity_range,
    input_reference: own_ref,
    transaction_outputs: outputs,
    input_stt_value: input_utxo.output.value,
    output_stt_value: output_utxo.value,
    input_state,
    output_state,
    output_reference_script: output_utxo.reference_script,
  }
}

// The single STT token under the same policy id and asset name must continue
// to live at the STT script address.
fn expect_stt_token_is_forwarded_unchanged(
  input_utxo: Output,
  output_utxo: Output,
) -> Bool {
  expect Script(stt_policy_id) = input_utxo.address.payment_credential

  expect [Pair(input_asset_name, input_quantity)] = input_utxo.value
    |> assets.tokens(stt_policy_id)
    |> dict.to_pairs()
  expect input_quantity == 1

  expect [Pair(output_asset_name, output_quantity)] = output_utxo.value
    |> assets.tokens(stt_policy_id)
    |> dict.to_pairs()
  expect output_quantity == 1
  expect output_asset_name == input_asset_name

  // Forwarded STT output must stay locked at the STT script.
  expect output_utxo.address.payment_credential == Script(stt_policy_id)
  True
}

// Decode both inline State datums.
fn expect_inline_states(
  input_utxo: Output,
  output_utxo: Output,
) -> Pair<state_types.State, state_types.State> {
  expect InlineDatum(input_datum) = input_utxo.datum
  expect InlineDatum(output_datum) = output_utxo.datum
  expect input_state: state_types.State = input_datum
  expect output_state: state_types.State = output_datum
  Pair(input_state, output_state)
}

// Reference scripts attached to the forwarded STT output bloat the STT UTxO
// (every future spend must include it in tx size and execution cost) and let
// the operator attach scripts that other contracts could pin. We forbid them
// by default; admin operator actions are exempt so an admin can re-host the
// STT's own reference script when re-deploying.
pub fn is_admin_operator_action(action: state_types.SttAction) -> Bool {
  when action is {
    state_types.RunOperator(op) -> op.path == state_types.Admin
    _ -> False
  }
}

// The forwarded STT output may TOP UP lovelace but must carry every NON-lovelace
// asset at EXACTLY the consumed quantity — no decrease (would leak value out of the
// STT UTxO) and no increase (would let any actor bloat the singleton STT UTxO with
// junk tokens that every future spend then has to carry, and that only the admin
// carve-out could ever strip back out).
//
// ┌─ DO NOT be misled by this function's name or by the `>=` below ───────────────┐
// │ The `>=` does NOT mean "every asset may grow". It applies to LOVELACE ONLY.   │
// │ Non-lovelace assets must be EXACTLY EQUAL — the comparator never touches them. │
// └───────────────────────────────────────────────────────────────────────────────┘
//
// Why `assets.match(output, input, >=)` enforces exactly that — verified against the
// stdlib source (aiken-lang/stdlib `cardano/assets.{match,expect_match}`):
//   1. ARGUMENT ORDER: `match(left, right, assert_lovelace)`. Here `left = output`
//      and `right = input`, and the callback is invoked as
//      `assert_lovelace(left_lovelace, right_lovelace)` — i.e.
//      `assert_lovelace(output_lovelace, input_lovelace)`. So `>=` reads as
//      `output_lovelace >= input_lovelace` (lovelace may be topped up).
//      KEEP `output` FIRST: swapping the two value args silently INVERTS the
//      lovelace direction (it would then require output lovelace to SHRINK).
//   2. NON-LOVELACE: the comparator is the LOVELACE-ONLY callback. For every other
//      asset, `expect_match` compares the non-ada maps with structural `==`
//      (`left_assets == right` in the stdlib body), so the `>=` is irrelevant to
//      them: ANY non-lovelace add OR remove fails, regardless of direction.
// Pinned by the add/remove non-lovelace `fail` tests in `stt_spend_value_tests.ak`
// — those tests are what would break first if a future stdlib bump changed this.
//
// This is the default value-preservation gate for every non-admin spend; the admin
// operator-use carve-out is the only path that bypasses it (see `eval_operator_use`),
// so admins can still reshape the STT UTxO's own (min-ADA-tier) contents.
pub fn stt_value_preserved_or_increased(context: TransitionContext) -> Bool {
  // output first, input second — see the ARGUMENT ORDER note above; `>=` governs
  // lovelace only, non-lovelace assets must be exactly equal.
  assets.match(context.output_stt_value, context.input_stt_value, >=)
}
