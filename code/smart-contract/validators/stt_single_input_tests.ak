//// STT input cardinality, through the active STT's spend path.
//// See the whitepaper Security Analysis invariant for the STT and State.

use aiken/interval
use cardano/address.{Address}
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

// The control and rejection differ only in the tokenless input's address.
// Its distinct reference prevents duplicate-input rejection from masking the
// address-count rule. Its value returns to the same external output.
fn operator_use_with_tokenless_input(input_address: Address) -> Transaction {
  let state = states.admin_state()
  let extra_value = assets.from_lovelace(2_000_000)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    state,
    state,
    [fixtures.payout_output(fixtures.address_from_key("admin"), extra_value)],
    fixtures.tx_id(#"a210"),
  )
  let extra_input = fixtures.external_input(
    fixtures.secondary_stt_input_ref(),
    input_address,
    extra_value,
  )
  Transaction { ..transaction, inputs: [extra_input, ..transaction.inputs] }
}

test stt_spend_accepts_tokenless_input_at_an_external_address() {
  let transaction = operator_use_with_tokenless_input(
    fixtures.address_from_key("admin"),
  )
  stt.eval_spend(
    None,
    fixtures.operator_use_action(state_types.Admin),
    fixtures.stt_input_ref(),
    transaction,
  )
}

test stt_spend_rejects_tokenless_input_at_the_stt_address() fail {
  let transaction = operator_use_with_tokenless_input(
    fixtures.stt_address(fixtures.default_policy_id()),
  )
  // Evaluate the actual STT input. Evaluating the tokenless input instead
  // would reject for its missing STT and would not isolate input cardinality.
  stt.eval_spend(
    None,
    fixtures.operator_use_action(state_types.Admin),
    fixtures.stt_input_ref(),
    transaction,
  )
}
