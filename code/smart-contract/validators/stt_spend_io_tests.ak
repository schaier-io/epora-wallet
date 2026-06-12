//// STT spend IO/plumbing tests: locating the consumed STT and its single
//// continuing output, rejecting extra STT inputs/outputs, and forwarding the
//// token + inline state unchanged (see `lib/stt/io.ak`).

use aiken/interval
use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use state/types as state_types
use stt
use stt/io as io
use test_support/security_fixtures as fixtures

test merged_stt_spend_accepts_exactly_one_continuing_output() {
  let policy_id = #"aa"
  let asset_name = #"01"
  let own_ref = OutputReference {
    transaction_id: #"5230000000000000000000000000000000000000000000000000000000000000",
    output_index: 0,
  }
  let address = Address {
    payment_credential: Script(policy_id),
    stake_credential: None,
  }
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
  let input = Input {
    output_reference: own_ref,
    output: Output {
      address,
      value: assets.merge(
        assets.from_lovelace(2_000_000),
        assets.from_asset(policy_id, asset_name, 1),
      ),
      datum: InlineDatum(stt_datum),
      reference_script: None,
    },
  }
  let output = Output {
    address,
    value: assets.merge(
      assets.from_lovelace(2_500_000),
      assets.from_asset(policy_id, asset_name, 1),
    ),
    datum: InlineDatum(stt_datum),
    reference_script: None,
  }
  let transaction = Transaction {
    ..placeholder,
    inputs: [input],
    outputs: [output],
    validity_range: interval.after(0),
    id: #"6230000000000000000000000000000000000000000000000000000000000000",
  }

  let Pair(_, actual_output) = io.expect_single_stt_io(own_ref, transaction)
  expect actual_output == output
}

// Non-admin actions cannot attach a reference script to the continuing STT
// output (admin operator actions can — see `is_admin_operator_action` for the
// rationale). Driven via a non-admin redeemer (`RenewProofOfLife`) so the
// dispatcher's admin carve-out does NOT apply.
test merged_stt_spend_rejects_reference_script_on_continuing_output() fail {
  let policy_id = #"aa"
  let asset_name = #"01"
  let own_ref = OutputReference {
    transaction_id: #"5330000000000000000000000000000000000000000000000000000000000000",
    output_index: 0,
  }
  let address = Address {
    payment_credential: Script(policy_id),
    stake_credential: None,
  }
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
  let input = Input {
    output_reference: own_ref,
    output: Output {
      address,
      value: assets.merge(
        assets.from_lovelace(2_000_000),
        assets.from_asset(policy_id, asset_name, 1),
      ),
      datum: InlineDatum(stt_datum),
      reference_script: None,
    },
  }
  let output = Output {
    address,
    value: assets.merge(
      assets.from_lovelace(2_500_000),
      assets.from_asset(policy_id, asset_name, 1),
    ),
    datum: InlineDatum(stt_datum),
    reference_script: Some(#"01"),
  }
  let transaction = Transaction {
    ..placeholder,
    inputs: [input],
    outputs: [output],
    validity_range: interval.after(0),
    id: #"6330000000000000000000000000000000000000000000000000000000000000",
  }

  expect
    stt.eval_spend(None, state_types.RenewProofOfLife, own_ref, transaction)
}

// Admin operator actions ARE allowed to attach a reference script to the STT
// output — they can re-host the STT reference script as part of an admin
// upgrade flow. This complements the test above.
test merged_stt_spend_admin_can_attach_reference_script_on_continuing_output() {
  let policy_id = fixtures.default_policy_id()
  let admin = fixtures.admin_user("admin")
  let input_state = fixtures.state([admin], None, [], Some(100), Some(50), [])
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(120),
      increment: Some(50),
    },
  }

  let stt_input = fixtures.stt_input(
    fixtures.stt_input_ref(),
    policy_id,
    input_state,
    fixtures.default_stt_value(),
  )
  let stt_output = Output {
    // Same shape as `fixtures.stt_output`, but with a reference script
    // attached — only admin operator actions may carry one.
    address: fixtures.stt_address(policy_id),
    value: fixtures.default_stt_value(),
    datum: InlineDatum(output_state),
    reference_script: Some(#"01"),
  }
  let transaction = fixtures.transaction(
    interval.between(110, 120),
    ["admin"],
    [stt_input],
    [stt_output],
    #"6431000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.Use,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test merged_stt_spend_rejects_missing_continuing_output() fail {
  let policy_id = #"aa"
  let asset_name = #"01"
  let own_ref = OutputReference {
    transaction_id: #"7230000000000000000000000000000000000000000000000000000000000000",
    output_index: 0,
  }
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
  let transaction = Transaction {
    ..placeholder,
    inputs: [
      Input {
        output_reference: own_ref,
        output: Output {
          address: Address {
            payment_credential: Script(policy_id),
            stake_credential: None,
          },
          value: assets.merge(
            assets.from_lovelace(2_000_000),
            assets.from_asset(policy_id, asset_name, 1),
          ),
          datum: InlineDatum(stt_datum),
          reference_script: None,
        },
      },
    ],
    outputs: [
      Output {
        address: Address {
          payment_credential: Script(#"bb"),
          stake_credential: None,
        },
        value: assets.merge(
          assets.from_lovelace(2_500_000),
          assets.from_asset(policy_id, asset_name, 1),
        ),
        datum: InlineDatum(stt_datum),
        reference_script: None,
      },
    ],
    validity_range: interval.after(0),
    id: #"8230000000000000000000000000000000000000000000000000000000000000",
  }

  expect _ = io.expect_single_stt_io(own_ref, transaction)
}

test merged_stt_spend_rejects_multiple_continuing_outputs() fail {
  let policy_id = #"aa"
  let asset_name = #"01"
  let own_ref = OutputReference {
    transaction_id: #"9230000000000000000000000000000000000000000000000000000000000000",
    output_index: 0,
  }
  let address = Address {
    payment_credential: Script(policy_id),
    stake_credential: None,
  }
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
  let transaction = Transaction {
    ..placeholder,
    inputs: [
      Input {
        output_reference: own_ref,
        output: Output {
          address,
          value: assets.merge(
            assets.from_lovelace(2_000_000),
            assets.from_asset(policy_id, asset_name, 1),
          ),
          datum: InlineDatum(stt_datum),
          reference_script: None,
        },
      },
    ],
    outputs: [
      Output {
        address,
        value: assets.merge(
          assets.from_lovelace(2_500_000),
          assets.from_asset(policy_id, asset_name, 1),
        ),
        datum: InlineDatum(stt_datum),
        reference_script: None,
      },
      Output {
        address,
        value: assets.from_lovelace(1_500_000),
        datum: InlineDatum(stt_datum),
        reference_script: None,
      },
    ],
    validity_range: interval.after(0),
    id: #"1030000000000000000000000000000000000000000000000000000000000000",
  }

  expect _ = io.expect_single_stt_io(own_ref, transaction)
}

// Re-homing proof: `expect_single_stt_io` locates the continuing STT output by
// FULL address (payment + stake), so a continuing output carrying the STT token
// at a DIFFERENT stake credential than the input is not found at the input's
// address — there are zero outputs there — and the `expect [output_utxo]` match
// fails. This is why the STT cannot be re-homed: the stake credential is pinned
// to the input's by this lookup, independently of any per-action check.
test merged_stt_spend_rejects_rehomed_continuing_output_stake_credential() fail {
  let policy_id = #"aa"
  let asset_name = #"01"
  let own_ref = OutputReference {
    transaction_id: #"5230000000000000000000000000000000000000000000000000000000000000",
    output_index: 0,
  }
  let input_address = Address {
    payment_credential: Script(policy_id),
    stake_credential: None,
  }
  // Same payment credential, attacker-controlled stake credential.
  let rehomed_address = Address {
    payment_credential: Script(policy_id),
    stake_credential: Some(Inline(VerificationKey(#"a77ac6e7"))),
  }
  let stt_datum = state_types.State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: None,
      increment: None,
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
  let stt_value = assets.merge(
    assets.from_lovelace(2_000_000),
    assets.from_asset(policy_id, asset_name, 1),
  )
  let transaction = Transaction {
    ..placeholder,
    inputs: [
      Input {
        output_reference: own_ref,
        output: Output {
          address: input_address,
          value: stt_value,
          datum: InlineDatum(stt_datum),
          reference_script: None,
        },
      },
    ],
    outputs: [
      Output {
        address: rehomed_address,
        value: stt_value,
        datum: InlineDatum(stt_datum),
        reference_script: None,
      },
    ],
    validity_range: interval.after(0),
    id: #"1130000000000000000000000000000000000000000000000000000000000000",
  }

  expect _ = io.expect_single_stt_io(own_ref, transaction)
}
