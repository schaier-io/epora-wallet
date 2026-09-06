//// Beneficiary stopping preserves earned debt and shares the non-admin cadence.

use aiken/cbor
use aiken/collection/list
use aiken/interval
use cardano/assets
use cardano/transaction.{Spend, Transaction}
use constants
use state/types as state_types
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment}
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use wallet/spend as wallet

const stop_action: state_types.SttAction =
  state_types.StopBeneficiaryStream(7, 1)

const tx_lower: Int = 120

const tx_upper: Int = 130

const lovelace_per_ms: Int = 1_000_000

const target_payment: StreamingPayment =
  StreamingPayment {
    ..states.base_streaming_payment(),
    id: 1,
    payout_address: fixtures.address_from_key("payee"),
    amount_per_day: constants.milliseconds_per_day * lovelace_per_ms,
    paid_out_amount: 50 * lovelace_per_ms,
    end_date: 10_000_000,
  }

fn input_state(target: StreamingPayment) -> state_types.State {
  states.secured_state(
    [states.admin_user("admin")],
    [
      states.default_beneficiary(7, "beneficiary", Some(100)),
      states.default_beneficiary(8, "other-beneficiary", Some(100)),
    ],
    [target, StreamingPayment { ..target_payment, id: 2 }],
  )
}

fn output_state(input: state_types.State, target_end: Int) -> state_types.State {
  state_types.State {
    ..input,
    streaming_payments: list.map(
      input.streaming_payments,
      fn(payment) {
        if payment.id == 1 {
          StreamingPayment { ..payment, end_date: target_end }
        } else {
          payment
        }
      },
    ),
    last_non_admin_payout_at: Some(tx_upper),
  }
}

fn stop_tx(input: state_types.State, output: state_types.State) -> Transaction {
  let stop_data: Data = stop_action
  Transaction {
    ..fixtures.stt_spend_tx(
      interval.between(tx_lower, tx_upper),
      ["beneficiary"],
      input,
      output,
      [],
      fixtures.tx_id(#"b501"),
    ),
    redeemers: [Pair(Spend(fixtures.stt_input_ref()), stop_data)],
  }
}

fn run_stop(transaction: Transaction) -> Bool {
  stt.eval_spend(None, stop_action, fixtures.stt_input_ref(), transaction)
}

test beneficiary_stop_constructor_is_appended_at_eight() {
  let stop: Data = stop_action
  let exit: Data = state_types.ExitBeneficiary(7)
  expect cbor.deserialise(#"d90501820701") == Some(stop)
  expect cbor.deserialise(#"d905008107") == Some(exit)
}

test beneficiary_stop_active_stream_keeps_earned_debt() {
  let input = input_state(target_payment)
  let output = output_state(input, tx_upper)
  expect run_stop(stop_tx(input, output))
  expect [stopped, ..] = output.streaming_payments
  expect
    funding.lifetime_total(stopped) - stopped.paid_out_amount == 80 * lovelace_per_ms
  expect output.access == input.access
}

test beneficiary_stop_future_stream_uses_start_date() {
  let target = StreamingPayment {
    ..target_payment,
    start_date: 200,
    paid_out_amount: 0,
  }
  let input = input_state(target)
  let output = output_state(input, 200)
  expect run_stop(stop_tx(input, output))
  expect [stopped, ..] = output.streaming_payments
  expect funding.lifetime_total(stopped) == 0
}

test beneficiary_stop_accepts_script_payee() {
  let target = StreamingPayment {
    ..target_payment,
    payout_address: fixtures.script_address(fixtures.key_hash("payee-script")),
  }
  let input = input_state(target)
  expect run_stop(stop_tx(input, output_state(input, tx_upper)))
}

test beneficiary_stop_rejects_missing_signature() fail {
  let input = input_state(target_payment)
  let tx = stop_tx(input, output_state(input, tx_upper))
  expect run_stop(Transaction { ..tx, extra_signatories: [] })
}

test beneficiary_stop_rejects_payee_only_signature() fail {
  let input = input_state(target_payment)
  let tx = stop_tx(input, output_state(input, tx_upper))
  expect
    run_stop(
      Transaction { ..tx, extra_signatories: [fixtures.key_hash("payee")] },
    )
}

test beneficiary_stop_rejects_multiple_beneficiary_signatures() fail {
  let input = input_state(target_payment)
  let tx = stop_tx(input, output_state(input, tx_upper))
  expect
    run_stop(
      Transaction {
        ..tx,
        extra_signatories: [
          fixtures.key_hash("beneficiary"),
          fixtures.key_hash("other-beneficiary"),
        ],
      },
    )
}

test beneficiary_stop_rejects_wrong_declared_beneficiary() fail {
  let input = input_state(target_payment)
  expect
    stt.eval_spend(
      None,
      state_types.StopBeneficiaryStream(8, 1),
      fixtures.stt_input_ref(),
      stop_tx(input, output_state(input, tx_upper)),
    )
}

test beneficiary_stop_rejects_missing_stream_id() fail {
  let input = input_state(target_payment)
  expect
    stt.eval_spend(
      None,
      state_types.StopBeneficiaryStream(7, 3),
      fixtures.stt_input_ref(),
      stop_tx(input, output_state(input, tx_upper)),
    )
}

test beneficiary_stop_rejects_locked_proof_of_life() fail {
  let input = input_state(target_payment) |> states.with_proof_of_life(150, 50)
  expect run_stop(stop_tx(input, output_state(input, tx_upper)))
}

test beneficiary_stop_rejects_locked_personal_delay() fail {
  let input = input_state(target_payment)
    |> states.with_beneficiaries(
        [states.default_beneficiary(7, "beneficiary", Some(150))],
      )
  expect run_stop(stop_tx(input, output_state(input, tx_upper)))
}

test beneficiary_stop_rejects_partial_shortening() fail {
  let input = input_state(target_payment)
  expect run_stop(stop_tx(input, output_state(input, tx_upper + 1)))
}

test beneficiary_stop_rejects_accrual_clawback() fail {
  let input = input_state(target_payment)
  expect run_stop(stop_tx(input, output_state(input, tx_upper - 1)))
}

test beneficiary_stop_rejects_noop() fail {
  let input = input_state(target_payment)
  expect run_stop(stop_tx(input, output_state(input, target_payment.end_date)))
}

test beneficiary_stop_rejects_extension() fail {
  let input = input_state(target_payment)
  expect
    run_stop(stop_tx(input, output_state(input, target_payment.end_date + 1)))
}

test beneficiary_stop_rejects_paid_out_change() fail {
  let input = input_state(target_payment)
  let changed = StreamingPayment {
    ..target_payment,
    paid_out_amount: 51 * lovelace_per_ms,
  }
  expect run_stop(stop_tx(input, output_state(input_state(changed), tx_upper)))
}

test beneficiary_stop_rejects_rate_change() fail {
  let input = input_state(target_payment)
  let changed = StreamingPayment {
    ..target_payment,
    amount_per_day: target_payment.amount_per_day - 1,
  }
  expect run_stop(stop_tx(input, output_state(input_state(changed), tx_upper)))
}

test beneficiary_stop_rejects_payout_address_change() fail {
  let input = input_state(target_payment)
  let changed = StreamingPayment {
    ..target_payment,
    payout_address: fixtures.address_from_key("changed"),
  }
  expect run_stop(stop_tx(input, output_state(input_state(changed), tx_upper)))
}

test beneficiary_stop_rejects_asset_change() fail {
  let input = input_state(target_payment)
  let changed = StreamingPayment {
    ..target_payment,
    policy_id: fixtures.default_policy_id(),
    asset_name: #"01",
  }
  expect run_stop(stop_tx(input, output_state(input_state(changed), tx_upper)))
}

test beneficiary_stop_rejects_start_date_change() fail {
  let input = input_state(target_payment)
  let changed = StreamingPayment { ..target_payment, start_date: 1 }
  expect run_stop(stop_tx(input, output_state(input_state(changed), tx_upper)))
}

test beneficiary_stop_rejects_other_stream_change() fail {
  let input = input_state(target_payment)
  let output = output_state(input, tx_upper)
  expect [target, other] = output.streaming_payments
  expect
    run_stop(
      stop_tx(
        input,
        state_types.State {
          ..output,
          streaming_payments: [
            target,
            StreamingPayment { ..other, end_date: tx_upper },
          ],
        },
      ),
    )
}

test beneficiary_stop_rejects_stream_removal() fail {
  let input = input_state(target_payment)
  let output = output_state(input, tx_upper)
  expect [_target, other] = output.streaming_payments
  expect
    run_stop(
      stop_tx(
        input,
        state_types.State { ..output, streaming_payments: [other] },
      ),
    )
}

test beneficiary_stop_rejects_other_state_change() fail {
  let input = input_state(target_payment)
  let output = output_state(input, tx_upper)
  expect
    run_stop(
      stop_tx(input, state_types.State { ..output, wallet_name: "changed" }),
    )
}

test beneficiary_stop_rejects_missing_cadence_stamp() fail {
  let input = input_state(target_payment)
  let output = output_state(input, tx_upper)
  expect
    run_stop(
      stop_tx(
        input,
        state_types.State { ..output, last_non_admin_payout_at: None },
      ),
    )
}

test beneficiary_stop_rejects_unbounded_validity() fail {
  let input = input_state(target_payment)
  let tx = stop_tx(input, output_state(input, tx_upper))
  expect
    run_stop(Transaction { ..tx, validity_range: interval.after(tx_lower) })
}

test beneficiary_stop_rejects_overwide_validity() fail {
  let upper = tx_lower + constants.max_payout_validity_window_ms + 1
  let input = input_state(target_payment)
  let output = state_types.State {
    ..output_state(input, upper),
    last_non_admin_payout_at: Some(upper),
  }
  let tx = stop_tx(input, output)
  expect
    run_stop(
      Transaction { ..tx, validity_range: interval.between(tx_lower, upper) },
    )
}

test beneficiary_stop_has_no_admin_cadence_bypass() fail {
  let input = state_types.State {
    ..input_state(target_payment),
    last_non_admin_payout_at: Some(tx_lower - 1),
  }
  let tx = stop_tx(input, output_state(input, tx_upper))
  expect
    run_stop(
      Transaction {
        ..tx,
        extra_signatories: [
          fixtures.key_hash("beneficiary"),
          fixtures.key_hash("admin"),
        ],
      },
    )
}

test beneficiary_stop_rejects_repeat_after_cooldown() fail {
  let stopped = output_state(input_state(target_payment), tx_upper)
  let next_lower = tx_upper + constants.non_admin_payout_cooldown_ms
  let next_upper = next_lower + 10
  let output = state_types.State {
    ..output_state(stopped, next_upper),
    last_non_admin_payout_at: Some(next_upper),
  }
  let tx = stop_tx(stopped, output)
  expect
    run_stop(
      Transaction {
        ..tx,
        validity_range: interval.between(next_lower, next_upper),
      },
    )
}

test beneficiary_stop_rejects_wallet_spending() fail {
  let input = input_state(target_payment)
  let tx = stop_tx(input, output_state(input, tx_upper))
  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      Transaction {
        ..tx,
        inputs: [
          fixtures.wallet_input(
            fixtures.wallet_input_ref(),
            assets.from_lovelace(2_000_000),
          ),
          ..tx.inputs
        ],
      },
    )
}

test beneficiary_stop_preserves_later_settlement() {
  let input = input_state(target_payment)
  let stopped = output_state(input, tx_upper)
  expect run_stop(stop_tx(input, stopped))
  expect [_target, other] = stopped.streaming_payments
  let settlement_time = tx_upper + constants.non_admin_payout_cooldown_ms
  let output = state_types.State {
    ..stopped,
    streaming_payments: [other],
    last_non_admin_payout_at: Some(settlement_time),
  }
  let payout_value = assets.from_lovelace(80 * lovelace_per_ms)
  let payout_action = state_types.PayStreamingPayment(
    [
      state_types.AssetEntry {
        policy_id: #"",
        asset_name: #"",
        quantity: 80 * lovelace_per_ms,
      },
    ],
  )
  let tx = fixtures.transaction_with_stt_redeemer(
    interval.between(settlement_time, settlement_time),
    [fixtures.key_hash("beneficiary")],
    [
      fixtures.stt_input(
        fixtures.stt_input_ref(),
        fixtures.default_policy_id(),
        stopped,
        fixtures.default_stt_value(),
      ),
      fixtures.wallet_input(fixtures.wallet_input_ref(), payout_value),
    ],
    [
      fixtures.stt_output(
        fixtures.default_policy_id(),
        output,
        fixtures.default_stt_value(),
      ),
      fixtures.tagged_streaming_payment_output(
        target_payment.payout_address,
        payout_value,
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    fixtures.tx_id(#"b502"),
    fixtures.stt_input_ref(),
    payout_action,
  )
  expect stt.eval_spend(None, payout_action, fixtures.stt_input_ref(), tx)
  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      tx,
    )
}
