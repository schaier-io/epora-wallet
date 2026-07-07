//// STT mint `Transaction` builder plus the canonical admin+beneficiary state
//// shared by the STT validator test suites. Spend builders live in
//// `test_support/security_fixtures` (`stt_spend_tx*`). Everything here is
//// plain data built from `test_support/security_fixtures` — none of it
//// touches the `stt` validator (lib modules must not import a validator).

use aiken/interval
use cardano/assets
use cardano/transaction.{Output, OutputReference, Transaction}
use state/types as state_types
use test_support/security_fixtures as fixtures

pub fn beneficiary_state() -> state_types.State {
  fixtures.state(
    [fixtures.user(0, ["admin"], [], [], 0, False, None, True)],
    None,
    [fixtures.beneficiary(7, ["beneficiary1"], Some(100), 1)],
    Some(100),
    Some(50),
    [],
  )
}

pub fn mint_transaction(
  mint: assets.Value,
  outputs: List<Output>,
  input_ref: OutputReference,
  id: ByteArray,
) -> Transaction {
  let transaction = fixtures.transaction(
    interval.after(0),
    [],
    [fixtures.wallet_input(input_ref, assets.from_lovelace(2_000_000))],
    outputs,
    id,
  )

  Transaction { ..transaction, mint }
}
