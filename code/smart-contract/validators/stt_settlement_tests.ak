//// STT settlement-family transition tests: PayStreamingPayment (payout shape
//// and state preservation — the crank cooldown is pinned in
//// stt_payout_cooldown_tests.ak) and Consolidate (authority paths and the
//// state-completely-unchanged freeze).

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Transaction}
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures

fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

test streaming_payment_payout_accepts_exact_due_payout() {
  let streaming_payment = fixtures.streaming_payment(
    1,
    fixtures.address_from_key("beneficiary1"),
    0,
    #"",
    #"",
    1_000_000,
    0,
    259_200_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    wallet_name: #"",
    streaming_payments: [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        1_000_000,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
    // The crank stamps the cooldown clock with the tx upper bound
    // (Settlement-cadence theorem);
    // set it so these tests exercise their intended check, not the cooldown.
    last_non_admin_payout_at: Some(86_400_000),
  }
  let payout_output = fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(1_000_000),
    fixtures.stt_input_ref(),
    1,
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(86_400_000, 86_400_000),
    ["beneficiary1"],
    input_state,
    output_state,
    [payout_output],
    #"2830000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.PayStreamingPayment(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test streaming_payment_payout_rejects_stt_lovelace_topup() fail {
  let streaming_payment = fixtures.streaming_payment(
    1,
    fixtures.address_from_key("beneficiary1"),
    0,
    #"",
    #"",
    1_000_000,
    0,
    259_200_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    wallet_name: #"",
    streaming_payments: [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        1_000_000,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
    // The crank stamps the cooldown clock with the tx upper bound
    // (Settlement-cadence theorem);
    // set it so these tests exercise their intended check, not the cooldown.
    last_non_admin_payout_at: Some(86_400_000),
  }
  let payout_output = fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(1_000_000),
    fixtures.stt_input_ref(),
    1,
  )
  let transaction = fixtures.stt_spend_tx_with_values(
    interval.between(86_400_000, 86_400_000),
    ["beneficiary1"],
    input_state,
    output_state,
    fixtures.default_stt_value(),
    fixtures.stt_value(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      3_000_000,
    ),
    [payout_output],
    #"2a30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.PayStreamingPayment(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test streaming_payment_payout_rejects_overpayment() fail {
  let streaming_payment = fixtures.streaming_payment(
    1,
    fixtures.address_from_key("beneficiary1"),
    0,
    #"",
    #"",
    1_000_000,
    0,
    259_200_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    wallet_name: #"",
    streaming_payments: [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        2_000_000,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  }
  let payout_output = fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(2_000_000),
    fixtures.stt_input_ref(),
    1,
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(86_400_000, 86_400_000),
    ["beneficiary1"],
    input_state,
    output_state,
    [payout_output],
    #"2930000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.PayStreamingPayment(
        assets.from_lovelace(2_000_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test streaming_payment_payout_rejects_missing_tagged_output() fail {
  let streaming_payment = fixtures.streaming_payment(
    1,
    fixtures.address_from_key("beneficiary1"),
    0,
    #"",
    #"",
    1_000_000,
    0,
    259_200_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    wallet_name: #"",
    streaming_payments: [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        1_000_000,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
    // The crank stamps the cooldown clock with the tx upper bound
    // (Settlement-cadence theorem);
    // set it so these tests exercise their intended check, not the cooldown.
    last_non_admin_payout_at: Some(86_400_000),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(86_400_000, 86_400_000),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    #"3030000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.PayStreamingPayment(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

test consolidate_accepts_admin_path() {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin"), fixtures.multisig_user(1, "ms1", 2)],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["admin"],
    input_state,
    input_state,
    [],
    #"3130000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(state_types.Consolidate(state_types.AdminPath), transaction)
}

test consolidate_accepts_multisig_path() {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin"), fixtures.multisig_user(1, "ms1", 2)],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["ms1"],
    input_state,
    input_state,
    [],
    #"3230000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.Consolidate(state_types.MultisigPath),
      transaction,
    )
}

test consolidate_accepts_beneficiary_path() {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin"), fixtures.multisig_user(1, "ms1", 2)],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    input_state,
    [],
    #"3330000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.Consolidate(state_types.BeneficiaryPath),
      transaction,
    )
}

test consolidate_rejects_wrong_authority_path() fail {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin"), fixtures.multisig_user(1, "ms1", 2)],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["admin"],
    input_state,
    input_state,
    [],
    #"3430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.Consolidate(state_types.MultisigPath),
      transaction,
    )
}

// Audit L3 (state-preservation coverage). The permissionless PayStreamingPayment
// crank is the ONLY unauthenticated action, and `state_unchanged_except_streaming_payments`
// (lib/stt/preservation.ak) is its sole guard on `access`/`proof_of_life`/`wallet_name`.
// This pins that guard directly: an otherwise-valid payout (the exact transition
// `streaming_payment_payout_accepts_exact_due_payout` accepts) that ALSO mutates
// `access.users` — here adding an attacker as a second admin — must be rejected.
// Without it, deleting the `access` comparison from the preservation helper would
// pass the whole suite while letting an unauthenticated party seize control on a
// 1-lovelace crank.
test streaming_payment_payout_rejects_access_mutation() fail {
  let streaming_payment = fixtures.streaming_payment(
    1,
    fixtures.address_from_key("beneficiary1"),
    0,
    #"",
    #"",
    1_000_000,
    0,
    259_200_000,
  )
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [streaming_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      ..input_state.access,
      users: [fixtures.admin_user("admin"), fixtures.admin_user("attacker")],
    },
    streaming_payments: [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        1_000_000,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  }
  let payout_output = fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(1_000_000),
    fixtures.stt_input_ref(),
    1,
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(86_400_000, 86_400_000),
    ["beneficiary1"],
    input_state,
    output_state,
    [payout_output],
    #"3530000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(
      state_types.PayStreamingPayment(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      transaction,
    )
}

// Audit L3. Consolidate requires `state_completely_unchanged`; the existing
// fuzz coverage only mutates `wallet_name`. This pins an `access` mutation
// directly: a correctly-authorized Consolidate (cf. `consolidate_accepts_admin_path`)
// that also adds an attacker admin must be rejected.
test consolidate_rejects_access_mutation() fail {
  let input_state = fixtures.secured_state(
    [fixtures.admin_user("admin"), fixtures.multisig_user(1, "ms1", 2)],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      ..input_state.access,
      users: [
        fixtures.admin_user("admin"),
        fixtures.multisig_user(1, "ms1", 2),
        fixtures.admin_user("attacker"),
      ],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"3730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    run_stt_spend(state_types.Consolidate(state_types.AdminPath), transaction)
}
