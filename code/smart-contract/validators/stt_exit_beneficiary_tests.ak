//// Permanent beneficiary exit: authorization, terminal State, and wallet shares.

use aiken/cbor
use aiken/interval
use cardano/assets
use cardano/transaction.{Transaction}
use constants
use state/configuration
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use wallet/spend as wallet

const exit_action: state_types.SttAction = state_types.ExitBeneficiary(7)

fn input_state(final: Bool) -> state_types.State {
  states.base_state()
    |> states.with_proof_of_life(100, 50)
    |> states.with_beneficiaries(
        if final {
          [states.default_beneficiary(7, "beneficiary", Some(100))]
        } else {
          [
            states.default_beneficiary(7, "beneficiary", Some(100)),
            states.default_beneficiary(8, "remaining", Some(200)),
          ]
        },
      )
}

fn output_state(input: state_types.State, final: Bool) -> state_types.State {
  state_types.State {
    ..input,
    access: state_types.AccessControl {
      ..input.access,
      beneficiaries: if final {
        []
      } else {
        [states.default_beneficiary(8, "remaining", Some(200))]
      },
    },
    last_non_admin_payout_at: if final {
      Some(130)
    } else {
      input.last_non_admin_payout_at
    },
  }
}

fn withdrawal_tx(
  input: state_types.State,
  output: state_types.State,
  wallet_input: assets.Value,
  wallet_output: assets.Value,
) -> Transaction {
  fixtures.transaction_with_stt_redeemer(
    interval.between(120, 130),
    [fixtures.key_hash("beneficiary")],
    [
      fixtures.stt_input(
        fixtures.stt_input_ref(),
        fixtures.default_policy_id(),
        input,
        fixtures.default_stt_value(),
      ),
      fixtures.wallet_input(fixtures.wallet_input_ref(), wallet_input),
    ],
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        output,
        fixtures.default_stt_value(),
      ),
      fixtures.payout_output(
        fixtures.address_from_key("beneficiary"),
        assets.difference(wallet_input, wallet_output),
      ),
      ..if wallet_output == assets.zero {
        []
      } else {
        [fixtures.wallet_output(wallet_output)]
      }
    ],
    fixtures.tx_id(#"eb01"),
    fixtures.stt_input_ref(),
    exit_action,
  )
}

fn ada_withdrawal_tx(
  input: state_types.State,
  output: state_types.State,
  remaining: Int,
) -> Transaction {
  withdrawal_tx(
    input,
    output,
    assets.from_lovelace(10_000_000),
    assets.from_lovelace(remaining),
  )
}

fn run_stt(tx: Transaction) -> Bool {
  stt.eval_spend(None, exit_action, fixtures.stt_input_ref(), tx)
}

fn run_wallet(tx: Transaction) -> Bool {
  wallet.eval_spend(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    None,
    0,
    fixtures.wallet_input_ref(),
    tx,
  )
}

test exit_beneficiary_constructor_is_appended() {
  let exit: Data = exit_action
  let beneficiary_use: Data = state_types.UseBeneficiary(7)
  let cancel: Data = state_types.CancelStreamingPayment(7)
  expect cbor.deserialise(#"d905008107") == Some(exit)
  expect cbor.deserialise(#"d87c8107") == Some(beneficiary_use)
  expect cbor.deserialise(#"d87f8107") == Some(cancel)
}

test earlier_exit_pays_weighted_share_and_preserves_cadence() {
  let input = state_types.State {
    ..input_state(False),
    last_non_admin_payout_at: Some(119),
  }
  let tx = ada_withdrawal_tx(input, output_state(input, False), 5_000_000)
  expect run_stt(tx)
  expect run_wallet(tx)
}

test final_exit_removes_last_access_path_and_pays_full_value() {
  let input = input_state(True)
  expect configuration.has_reachable_access_path(input.access)
  let output = output_state(input, True)
  expect !configuration.has_reachable_access_path(output.access)
  let tx = ada_withdrawal_tx(input, output, 0)
  expect run_stt(tx)
  expect run_wallet(tx)
}

test final_exit_can_leave_wallet_funds_permanently() {
  let input = input_state(True)
  let tx = ada_withdrawal_tx(input, output_state(input, True), 5_000_000)
  expect run_stt(tx)
  expect run_wallet(tx)
}

test exit_rejects_missing_signature() fail {
  let input = input_state(True)
  let tx = ada_withdrawal_tx(input, output_state(input, True), 0)
  expect run_stt(Transaction { ..tx, extra_signatories: [] })
}

test exit_rejects_wrong_declared_beneficiary() fail {
  let input = input_state(True)
  let tx = ada_withdrawal_tx(input, output_state(input, True), 0)
  expect
    stt.eval_spend(
      None,
      state_types.ExitBeneficiary(8),
      fixtures.stt_input_ref(),
      tx,
    )
}

test exit_rejects_locked_beneficiary() fail {
  let input = input_state(True)
  let tx = ada_withdrawal_tx(input, output_state(input, True), 0)
  expect run_stt(Transaction { ..tx, validity_range: interval.between(90, 95) })
}

test final_exit_rejects_retained_beneficiary() fail {
  let input = input_state(True)
  let output = state_types.State {
    ..input,
    last_non_admin_payout_at: Some(130),
  }
  expect run_stt(ada_withdrawal_tx(input, output, 0))
}

test earlier_exit_rejects_removing_other_beneficiary() fail {
  let input = input_state(False)
  let output = output_state(input, True)
  expect run_stt(ada_withdrawal_tx(input, output, 5_000_000))
}

test exit_rejects_unrelated_state_change() fail {
  let input = input_state(True)
  let output = state_types.State {
    ..output_state(input, True),
    wallet_name: "changed",
  }
  expect run_stt(ada_withdrawal_tx(input, output, 0))
}

test final_exit_rejects_stream_even_when_fully_paid() fail {
  let payment = StreamingPayment {
    ..states.base_streaming_payment(),
    paid_out_amount: 3_000_000,
  }
  let input = input_state(True) |> states.with_streaming_payments([payment])
  expect run_stt(ada_withdrawal_tx(input, output_state(input, True), 0))
}

test final_exit_rejects_cooldown_violation() fail {
  let input = state_types.State {
    ..input_state(True),
    last_non_admin_payout_at: Some(120),
  }
  expect run_stt(ada_withdrawal_tx(input, output_state(input, True), 0))
}

test final_exit_accepts_after_cooldown() {
  let input = state_types.State {
    ..input_state(True),
    last_non_admin_payout_at: Some(120),
  }
  let lower = 120 + constants.non_admin_payout_cooldown_ms
  let output = state_types.State {
    ..output_state(input, True),
    last_non_admin_payout_at: Some(lower + 10),
  }
  let tx = ada_withdrawal_tx(input, output, 0)
  expect
    run_stt(
      Transaction { ..tx, validity_range: interval.between(lower, lower + 10) },
    )
}

test final_exit_rejects_unbounded_window() fail {
  let input = input_state(True)
  let tx = ada_withdrawal_tx(input, output_state(input, True), 0)
  expect run_stt(Transaction { ..tx, validity_range: interval.after(120) })
}

test earlier_exit_rejects_excess_weighted_share() fail {
  let input = input_state(False)
  let tx = ada_withdrawal_tx(input, output_state(input, False), 4_999_999)
  expect run_stt(tx)
  expect run_wallet(tx)
}

test earlier_exit_keeps_native_stream_reserve() {
  let policy = fixtures.policy_id(#"ec")
  let payment = StreamingPayment {
    ..states.base_streaming_payment(),
    policy_id: policy,
    asset_name: #"01",
    amount_per_day: 86_400_000,
    start_date: 0,
    end_date: 120,
  }
  let input = input_state(False) |> states.with_streaming_payments([payment])
  let input_value = assets.from_lovelace(10_000_000)
    |> assets.add(policy, #"01", 123)
  let output_value = assets.from_lovelace(5_000_000)
    |> assets.add(policy, #"01", 122)
  let tx = withdrawal_tx(
    input,
    output_state(input, False),
    input_value,
    output_value,
  )
  expect run_stt(tx)
  expect run_wallet(tx)
}

test earlier_exit_rejects_native_stream_reserve_outflow() fail {
  let policy = fixtures.policy_id(#"ec")
  let payment = StreamingPayment {
    ..states.base_streaming_payment(),
    policy_id: policy,
    asset_name: #"01",
    amount_per_day: 86_400_000,
    start_date: 0,
    end_date: 120,
  }
  let input = input_state(False) |> states.with_streaming_payments([payment])
  let input_value = assets.from_lovelace(10_000_000)
    |> assets.add(policy, #"01", 120)
  let output_value = assets.from_lovelace(5_000_000)
    |> assets.add(policy, #"01", 119)
  let tx = withdrawal_tx(
    input,
    output_state(input, False),
    input_value,
    output_value,
  )
  expect run_stt(tx)
  expect run_wallet(tx)
}

test terminal_exit_state_still_fails_configuration_reachability() fail {
  configuration.expect_valid_state_configuration(
    output_state(input_state(True), True),
  )
}

test final_exit_rejects_missing_cadence_stamp() fail {
  let input = input_state(True)
  let output = state_types.State {
    ..output_state(input, True),
    last_non_admin_payout_at: None,
  }
  expect run_stt(ada_withdrawal_tx(input, output, 0))
}

test earlier_exit_rejects_changed_cadence() fail {
  let input = input_state(False)
  let output = state_types.State {
    ..output_state(input, False),
    last_non_admin_payout_at: Some(130),
  }
  expect run_stt(ada_withdrawal_tx(input, output, 5_000_000))
}

test final_exit_rejects_overwide_window() fail {
  let input = input_state(True)
  let upper = 120 + constants.max_payout_validity_window_ms + 1
  let output = state_types.State {
    ..output_state(input, True),
    last_non_admin_payout_at: Some(upper),
  }
  let tx = ada_withdrawal_tx(input, output, 0)
  expect
    run_stt(Transaction { ..tx, validity_range: interval.between(120, upper) })
}
