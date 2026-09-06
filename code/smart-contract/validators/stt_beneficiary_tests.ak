//// STT beneficiary-use transition tests: UseBeneficiary (weighted recovery
//// and its unlock-authority / single-actor guards).

use aiken/collection/list
use aiken/interval
use aiken/primitive/bytearray.{from_int_big_endian}
use cardano/transaction.{Transaction}
use constants
use state/types as state_types
use streaming_payments/types.{StreamingPayment}
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

fn make_beneficiaries_from(
  next_id: Int,
  remaining: Int,
) -> List<state_types.Beneficiary> {
  if remaining <= 0 {
    []
  } else {
    [
      state_types.Beneficiary {
        ..states.base_beneficiary(),
        id: next_id,
        beneficiary_wallets: [from_int_big_endian(next_id, 28)],
        unlock_after: Some(100),
      },
      ..make_beneficiaries_from(next_id + 1, remaining - 1)
    ]
  }
}

fn make_streaming_payments_from(
  next_id: Int,
  remaining: Int,
) -> List<StreamingPayment> {
  if remaining <= 0 {
    []
  } else {
    [
      states.ada_streaming_payment(
        next_id,
        from_int_big_endian(1_000 + next_id, 28),
        0,
      ),
      ..make_streaming_payments_from(next_id + 1, remaining - 1)
    ]
  }
}

test beneficiary_use_preserves_final_beneficiary_for_repeatable_recovery() {
  let input_state = states.secured_state(
    [states.renewing_user(1, "user1")],
    [states.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    last_non_admin_payout_at: Some(130),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(120, 130),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"2530"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

test beneficiary_use_rejects_removing_final_beneficiary() fail {
  let input_state = states.secured_state(
    [states.renewing_user(1, "user1")],
    [states.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      ..input_state.access,
      beneficiaries: [],
    },
    last_non_admin_payout_at: Some(130),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(120, 130),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"2631"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

test beneficiary_use_rejects_repeat_within_cooldown() fail {
  let input_state = state_types.State {
    ..states.secured_state(
      [states.renewing_user(1, "user1")],
      [states.default_beneficiary(7, "beneficiary1", Some(100))],
      [],
    ),
    last_non_admin_payout_at: Some(120),
  }
  let output_state = state_types.State {
    ..input_state,
    last_non_admin_payout_at: Some(140),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(130, 140),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"2632"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

test beneficiary_use_accepts_repeat_after_cooldown() {
  let input_state = state_types.State {
    ..states.secured_state(
      [states.renewing_user(1, "user1")],
      [states.default_beneficiary(7, "beneficiary1", Some(100))],
      [],
    ),
    last_non_admin_payout_at: Some(120),
  }
  let tx_earliest = 120 + constants.non_admin_payout_cooldown_ms
  let output_state = state_types.State {
    ..input_state,
    last_non_admin_payout_at: Some(tx_earliest + 10),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(tx_earliest, tx_earliest + 10),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"2633"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

// A State admitted at the aggregate beneficiary-wallet cap must retain its
// recovery path even when the acting beneficiary is last in the list and the
// State also carries the maximum streaming-payment count.
test beneficiary_use_accepts_last_beneficiary_at_total_wallet_cap() {
  let beneficiaries = make_beneficiaries_from(1, 15)
  let input_state = states.secured_state(
    [states.renewing_user(100, "user1")],
    beneficiaries,
    make_streaming_payments_from(1, 15),
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      ..input_state.access,
      beneficiaries: list.take(beneficiaries, 14),
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    [from_int_big_endian(15, 28)],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"2531"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(15), transaction)
}

test beneficiary_use_rejects_ambiguous_beneficiary_authority() fail {
  let input_state = states.secured_state(
    [states.renewing_user(1, "user1")],
    [
      states.default_beneficiary(7, "beneficiary1", Some(100)),
      states.default_beneficiary(8, "beneficiary2", Some(100)),
    ],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1", "beneficiary2"],
    input_state,
    input_state,
    [],
    fixtures.tx_id(#"2630"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

test beneficiary_use_rejects_locked_shared_wallet_overlap() fail {
  let input_state = states.secured_state(
    [states.renewing_user(1, "shared")],
    [states.default_beneficiary(7, "shared", Some(200))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["shared"],
    input_state,
    input_state,
    [],
    fixtures.tx_id(#"2730"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}

// Earlier beneficiaries remain one-shot because their weight is below 100%.
// Retaining one would let it claim the same weighted share again.
test beneficiary_use_rejects_retained_nonfinal_beneficiary() fail {
  let input_state = states.secured_state(
    [states.renewing_user(1, "user1")],
    [
      states.default_beneficiary(7, "beneficiary1", Some(100)),
      states.default_beneficiary(8, "beneficiary2", Some(200)),
    ],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    input_state,
    [],
    fixtures.tx_id(#"3630"),
  )

  expect run_stt_spend(state_types.UseBeneficiary(7), transaction)
}
