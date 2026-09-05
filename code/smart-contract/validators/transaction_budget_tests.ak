//// Transaction-level execution-budget fixtures.
////
//// Each test evaluates exactly one script execution from a shared transaction.
//// `scripts/check-budgets.mjs` groups the `scenario__script_leg` names and sums
//// their execution units. This avoids charging a recursive test harness while
//// still measuring every named Epora script execution in that group. External
//// validator executions in the same transaction are outside these fixtures.
////
//// These are synthetic execution-cost fixtures. They model the on-chain
//// `Transaction` seen by validators, but they do not prove that an off-chain
//// transaction serializes below the ledger transaction-size limit.

use aiken/cbor
use aiken/collection/list
use aiken/interval
use aiken/primitive/bytearray.{from_int_big_endian} as bytearray
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{
  Input, Mint, Output, OutputReference, Redeemer, ScriptPurpose, Spend,
  Transaction, Withdraw,
}
use constants
use state/allowance as state_allowance
use state/types as state_types
use streaming_payments/funding
use streaming_payments/types.{StreamingPayment}
use stt
use stt/io as stt_io
use test_support/security_fixtures as fixtures
use test_support/state_builders as states
use wallet

const fixture_user_count: Int = 10

const fixture_beneficiary_count: Int = 5

const fixture_stream_count: Int = 15

const beneficiary_actor_id: Int = fixture_beneficiary_count

const max_beneficiary_fixture_count: Int = constants.max_beneficiaries

const max_beneficiary_actor_id: Int = constants.max_state_integer

const consolidation_wallet_input_count: Int =
  constants.max_wallet_inputs_per_consolidation

const consolidation_decoy_input_count: Int =
  constants.max_transaction_inputs - consolidation_wallet_input_count - 1

const consolidation_decoy_output_count: Int =
  constants.max_transaction_outputs - 2

const wallet_input_lovelace: Int = 2_000_000

const beneficiary_use_input_lovelace: Int = 25_000_000

const beneficiary_native_asset_count: Int =
  constants.max_bounded_wallet_native_assets

const beneficiary_native_asset_payout_quantity: Int =
  constants.max_state_integer / max_beneficiary_fixture_count

const payout_batch_count: Int = 2

const fixture_total_user_wallet_count: Int = 15

const fixture_total_allowance_entry_count: Int =
  constants.max_total_allowance_entries

const allowance_actor_entry_count: Int = constants.max_allowance_entries

const near_max_value_padding_policy_count: Int = 7

const near_max_value_padding_first_policy_asset_count: Int = 61

const near_max_value_padding_other_policy_asset_count: Int = 255

const near_max_value_encoded_bytes: Int = 4_999

const deep_value_policy_count: Int = 150

const deep_value_min_encoded_bytes: Int = 4_900

const target_value_max_encoded_bytes: Int = 5_000

const allowance_input_remaining_entry_count: Int = allowance_actor_entry_count

const allowance_static_entry_count: Int =
  fixture_total_allowance_entry_count - allowance_actor_entry_count * 2

const single_stream_reserve_quantity: Int = 1_000_001

const allowance_reserve_quantity: Int =
  fixture_stream_count / allowance_actor_entry_count * single_stream_reserve_quantity

const fixture_total_beneficiary_wallet_count: Int = 15

const payout_time: Int = 86_400_000

const payout_output_lovelace: Int = 1_500_000

const payout_wallet_lovelace: Int = 5_000_000

const allowance_base_input_count: Int = 3

const allowance_base_output_count: Int = 3

const allowance_decoy_input_count: Int =
  constants.max_transaction_inputs - allowance_base_input_count

const allowance_decoy_output_count: Int =
  constants.max_transaction_outputs - allowance_base_output_count

const allowance_decoy_signatory_count: Int =
  constants.max_transaction_signatories - 1

fn user_wallet_hash(user_id: Int, wallet_id: Int) -> ByteArray {
  from_int_big_endian(1_000 + user_id * 100 + wallet_id, 28)
}

fn user_wallet_count(user_id: Int) -> Int {
  if user_id == fixture_user_count {
    fixture_total_user_wallet_count - fixture_user_count + 1
  } else {
    1
  }
}

fn allowance_entry_count_at_offset(offset: Int) -> Int {
  let remaining = fixture_total_allowance_entry_count - offset
  if remaining <= 0 {
    0
  } else if remaining > constants.max_allowance_entries {
    constants.max_allowance_entries
  } else {
    remaining
  }
}

fn user_per_day_allowance_entry_count(user_id: Int) -> Int {
  allowance_entry_count_at_offset(
    ( user_id - 1 ) * constants.max_allowance_entries * 2,
  )
}

fn user_remaining_allowance_entry_count(user_id: Int) -> Int {
  allowance_entry_count_at_offset(
    ( user_id - 1 ) * constants.max_allowance_entries * 2 + constants.max_allowance_entries,
  )
}

fn make_user_wallets_from(
  user_id: Int,
  next_wallet_id: Int,
  remaining: Int,
) -> List<ByteArray> {
  if remaining <= 0 {
    []
  } else {
    [
      user_wallet_hash(user_id, next_wallet_id),
      ..make_user_wallets_from(user_id, next_wallet_id + 1, remaining - 1)
    ]
  }
}

fn make_allowance_entries_from(
  next_asset_id: Int,
  remaining: Int,
) -> state_types.AssetEntries {
  if remaining <= 0 {
    []
  } else {
    [
      asset_entries.asset_entry(
        from_int_big_endian(1, 28),
        from_int_big_endian(next_asset_id, constants.max_asset_name_bytes),
        1,
      ),
      ..make_allowance_entries_from(next_asset_id + 1, remaining - 1)
    ]
  }
}

fn make_distinct_allowance_entries_from(
  next_asset_id: Int,
  remaining: Int,
  quantity: Int,
) -> state_types.AssetEntries {
  if remaining <= 0 {
    []
  } else {
    [
      asset_entries.asset_entry(
        payout_policy_id(next_asset_id),
        payout_asset_name(next_asset_id),
        quantity,
      ),
      ..make_distinct_allowance_entries_from(
        next_asset_id + 1,
        remaining - 1,
        quantity,
      )
    ]
  }
}

fn make_short_asset_pairs_from(
  next_asset_name: Int,
  remaining: Int,
) -> Pairs<ByteArray, Int> {
  if remaining <= 0 {
    []
  } else {
    [
      Pair(from_int_big_endian(next_asset_name, 1), 1),
      ..make_short_asset_pairs_from(next_asset_name + 1, remaining - 1)
    ]
  }
}

fn make_near_max_value_padding_policies_from(
  next_policy_id: Int,
  remaining: Int,
) -> Pairs<ByteArray, Pairs<ByteArray, Int>> {
  if remaining <= 0 {
    []
  } else {
    let asset_count = if next_policy_id == 0 {
      near_max_value_padding_first_policy_asset_count
    } else {
      near_max_value_padding_other_policy_asset_count
    }
    [
      Pair(
        from_int_big_endian(4_000 + next_policy_id, 28),
        [Pair(#"", 1), ..make_short_asset_pairs_from(0, asset_count - 1)],
      ),
      ..make_near_max_value_padding_policies_from(
        next_policy_id + 1,
        remaining - 1,
      )
    ]
  }
}

fn make_deep_value_policies_from(
  next_policy_id: Int,
  remaining: Int,
) -> Pairs<ByteArray, Pairs<ByteArray, Int>> {
  if remaining <= 0 {
    []
  } else {
    [
      Pair(from_int_big_endian(next_policy_id, 28), [Pair(#"", 1)]),
      ..make_deep_value_policies_from(next_policy_id + 1, remaining - 1)
    ]
  }
}

fn make_users_from(next_user_id: Int, remaining: Int) -> List<state_types.User> {
  if remaining <= 0 {
    []
  } else {
    [
      state_types.User {
        id: next_user_id,
        user_wallets: make_user_wallets_from(
          next_user_id,
          1,
          user_wallet_count(next_user_id),
        ),
        per_day_allowance: make_allowance_entries_from(
          1,
          user_per_day_allowance_entry_count(next_user_id),
        ),
        remaining_allowance: make_allowance_entries_from(
          1,
          user_remaining_allowance_entry_count(next_user_id),
        ),
        next_allowance_reset: payout_time,
        can_renew_proof_of_life: True,
        multi_sig_power: Some(1),
        is_admin: True,
      },
      ..make_users_from(next_user_id + 1, remaining - 1)
    ]
  }
}

fn make_allowance_scenario_users_from(
  next_user_id: Int,
  remaining: Int,
  actor_remaining_entry_count: Int,
  actor_remaining_quantity: Int,
  actor_next_allowance_reset: Int,
) -> List<state_types.User> {
  if remaining <= 0 {
    []
  } else {
    let is_actor = next_user_id == fixture_user_count
    let is_static_allowance_user = next_user_id == 1
    let per_day_entry_count = if is_actor {
      allowance_actor_entry_count
    } else {
      0
    }
    let remaining_entry_count = if is_actor {
      actor_remaining_entry_count
    } else if is_static_allowance_user {
      allowance_static_entry_count
    } else {
      0
    }
    let first_asset_id = if is_static_allowance_user {
      allowance_actor_entry_count + 1
    } else {
      1
    }
    let remaining_quantity = if is_actor {
      actor_remaining_quantity
    } else {
      1
    }
    [
      state_types.User {
        id: next_user_id,
        user_wallets: make_user_wallets_from(
          next_user_id,
          1,
          user_wallet_count(next_user_id),
        ),
        per_day_allowance: make_distinct_allowance_entries_from(
          first_asset_id,
          per_day_entry_count,
          1,
        ),
        remaining_allowance: make_distinct_allowance_entries_from(
          first_asset_id,
          remaining_entry_count,
          remaining_quantity,
        ),
        next_allowance_reset: if is_actor {
          actor_next_allowance_reset
        } else {
          payout_time
        },
        can_renew_proof_of_life: True,
        multi_sig_power: Some(1),
        is_admin: True,
      },
      ..make_allowance_scenario_users_from(
        next_user_id + 1,
        remaining - 1,
        actor_remaining_entry_count,
        actor_remaining_quantity,
        actor_next_allowance_reset,
      )
    ]
  }
}

fn make_beneficiaries_from(
  next_id: Int,
  remaining: Int,
) -> List<state_types.Beneficiary> {
  if remaining <= 0 {
    []
  } else {
    let wallet_start = beneficiary_wallet_start(next_id)
    let wallet_count = beneficiary_wallet_count(next_id)
    [
      state_types.Beneficiary {
        ..states.base_beneficiary(),
        id: next_id,
        beneficiary_wallets: make_beneficiary_wallets_from(
          wallet_start,
          wallet_count,
        ),
        unlock_after: Some(100),
      },
      ..make_beneficiaries_from(next_id + 1, remaining - 1)
    ]
  }
}

fn make_max_width_beneficiaries_from(
  next: Int,
  remaining: Int,
) -> List<state_types.Beneficiary> {
  if remaining <= 0 {
    []
  } else {
    [
      state_types.Beneficiary {
        id: constants.max_state_integer - max_beneficiary_fixture_count + next,
        beneficiary_wallets: [
          from_int_big_endian(next, constants.credential_hash_bytes),
        ],
        unlock_after: Some(constants.max_state_integer),
        weight: constants.max_state_integer,
      },
      ..make_max_width_beneficiaries_from(next + 1, remaining - 1)
    ]
  }
}

fn last_beneficiary_wallet_count() -> Int {
  let available = fixture_total_beneficiary_wallet_count - fixture_beneficiary_count + 1
  if available > constants.max_beneficiary_wallets {
    constants.max_beneficiary_wallets
  } else {
    available
  }
}

fn first_beneficiary_wallet_count() -> Int {
  fixture_total_beneficiary_wallet_count - last_beneficiary_wallet_count() - fixture_beneficiary_count + 2
}

fn beneficiary_wallet_count(beneficiary_id: Int) -> Int {
  if beneficiary_id == fixture_beneficiary_count {
    last_beneficiary_wallet_count()
  } else if beneficiary_id == 1 {
    first_beneficiary_wallet_count()
  } else {
    1
  }
}

fn beneficiary_wallet_start(beneficiary_id: Int) -> Int {
  if beneficiary_id == 1 {
    1
  } else if beneficiary_id == fixture_beneficiary_count {
    fixture_total_beneficiary_wallet_count - last_beneficiary_wallet_count() + 1
  } else {
    first_beneficiary_wallet_count() + beneficiary_id - 1
  }
}

fn make_beneficiary_wallets_from(
  next_wallet_id: Int,
  remaining: Int,
) -> List<ByteArray> {
  if remaining <= 0 {
    []
  } else {
    [
      from_int_big_endian(next_wallet_id, 28),
      ..make_beneficiary_wallets_from(next_wallet_id + 1, remaining - 1)
    ]
  }
}

fn payout_asset_name(payment_id: Int) -> ByteArray {
  from_int_big_endian(payment_id, constants.max_asset_name_bytes)
}

fn payout_policy_id(payment_id: Int) -> ByteArray {
  from_int_big_endian(3_000 + payment_id, 28)
}

fn payout_payee_hash(payment_id: Int) -> ByteArray {
  from_int_big_endian(2_000 + payment_id, 28)
}

fn make_distinct_streaming_payments_from(
  next_id: Int,
  remaining: Int,
  paid_out_count: Int,
) -> List<StreamingPayment> {
  if remaining <= 0 {
    []
  } else {
    [
      StreamingPayment {
        ..states.base_streaming_payment(),
        id: next_id,
        payout_address: fixtures.address_from_key(payout_payee_hash(next_id)),
        paid_out_amount: if next_id > fixture_stream_count - paid_out_count {
          1
        } else {
          0
        },
        policy_id: payout_policy_id(next_id),
        asset_name: payout_asset_name(next_id),
      },
      ..make_distinct_streaming_payments_from(
        next_id + 1,
        remaining - 1,
        paid_out_count,
      )
    ]
  }
}

fn settle_streaming_payments(
  streaming_payments: List<StreamingPayment>,
) -> List<StreamingPayment> {
  list.map(
    streaming_payments,
    fn(streaming_payment) {
      StreamingPayment {
        ..streaming_payment,
        paid_out_amount: funding.lifetime_total(streaming_payment),
      }
    },
  )
}

fn make_allowance_streaming_payments_from(
  next_id: Int,
  next_asset_id: Int,
  remaining: Int,
) -> List<StreamingPayment> {
  if remaining <= 0 {
    []
  } else {
    [
      StreamingPayment {
        ..states.base_streaming_payment(),
        id: next_id,
        payout_address: fixtures.address_from_key(payout_payee_hash(next_id)),
        policy_id: payout_policy_id(next_asset_id),
        asset_name: payout_asset_name(next_asset_id),
      },
      ..make_allowance_streaming_payments_from(
        next_id + 1,
        next_asset_id + 1,
        remaining - 1,
      )
    ]
  }
}

fn maximize_allowance_quantities(
  entries: state_types.AssetEntries,
) -> state_types.AssetEntries {
  list.map(
    entries,
    fn(entry) {
      state_types.AssetEntry { ..entry, quantity: constants.max_state_integer }
    },
  )
}

fn scalar_heavy_users() -> List<state_types.User> {
  make_users_from(1, fixture_user_count)
    |> list.map(
        fn(user) {
          state_types.User {
            ..user,
            id: constants.max_state_integer - ( user.id - 1 ),
            per_day_allowance: maximize_allowance_quantities(
              user.per_day_allowance,
            ),
            remaining_allowance: maximize_allowance_quantities(
              user.remaining_allowance,
            ),
            next_allowance_reset: constants.max_state_integer,
            multi_sig_power: Some(constants.max_state_integer),
          }
        },
      )
}

fn scalar_heavy_beneficiaries() -> List<state_types.Beneficiary> {
  make_beneficiaries_from(1, fixture_beneficiary_count)
    |> list.map(
        fn(beneficiary) {
          state_types.Beneficiary {
            ..beneficiary,
            id: constants.max_state_integer - ( beneficiary.id - 1 ),
            unlock_after: Some(constants.max_state_integer),
            weight: constants.max_state_integer,
          }
        },
      )
}

fn scalar_heavy_streaming_payments() -> List<StreamingPayment> {
  make_distinct_streaming_payments_from(1, fixture_stream_count, 0)
    |> list.map(
        fn(payment) {
          StreamingPayment {
            ..payment,
            id: constants.max_state_integer - ( payment.id - 1 ),
            paid_out_amount: constants.max_state_integer,
            amount_per_day: constants.max_state_integer,
            start_date: constants.max_state_integer - constants.milliseconds_per_day,
            end_date: constants.max_state_integer,
          }
        },
      )
}

fn make_payout_value_from(next_id: Int, remaining: Int) -> assets.Value {
  if remaining <= 0 {
    assets.zero
  } else {
    assets.merge(
      assets.from_asset(
        payout_policy_id(next_id),
        payout_asset_name(next_id),
        1,
      ),
      make_payout_value_from(next_id + 1, remaining - 1),
    )
  }
}

fn make_tagged_payout_outputs_from(next_id: Int, remaining: Int) -> List<Output> {
  if remaining <= 0 {
    []
  } else {
    [
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key(payout_payee_hash(next_id)),
        assets.merge(
          assets.from_lovelace(payout_output_lovelace),
          assets.from_asset(
            payout_policy_id(next_id),
            payout_asset_name(next_id),
            1,
          ),
        ),
        fixtures.stt_input_ref(),
        next_id,
      ),
      ..make_tagged_payout_outputs_from(next_id + 1, remaining - 1)
    ]
  }
}

fn wallet_input_reference(index: Int) -> OutputReference {
  fixtures.output_ref(fixtures.tx_id(#"4230"), index)
}

fn allowance_decoy_input_reference(index: Int) -> OutputReference {
  fixtures.output_ref(fixtures.tx_id(#"b730"), index)
}

fn make_allowance_decoy_inputs_from(next: Int, remaining: Int) -> List<Input> {
  if remaining <= 0 {
    []
  } else {
    let address = if next == 0 {
      fixtures.script_address(from_int_big_endian(8_000, 28))
    } else {
      fixtures.address_from_key("padding")
    }
    [
      fixtures.external_input(
        allowance_decoy_input_reference(next),
        address,
        assets.from_lovelace(wallet_input_lovelace),
      ),
      ..make_allowance_decoy_inputs_from(next + 1, remaining - 1)
    ]
  }
}

fn make_key_decoy_inputs_from(next: Int, remaining: Int) -> List<Input> {
  if remaining <= 0 {
    []
  } else {
    [
      fixtures.external_input(
        fixtures.output_ref(fixtures.tx_id(#"b830"), next),
        fixtures.address_from_key("padding"),
        assets.from_lovelace(wallet_input_lovelace),
      ),
      ..make_key_decoy_inputs_from(next + 1, remaining - 1)
    ]
  }
}

fn make_allowance_decoy_outputs(remaining: Int) -> List<Output> {
  if remaining <= 0 {
    []
  } else {
    [
      fixtures.payout_output(
        fixtures.address_from_key("padding"),
        assets.from_lovelace(wallet_input_lovelace),
      ),
      ..make_allowance_decoy_outputs(remaining - 1)
    ]
  }
}

fn make_allowance_decoy_signatories_from(
  next: Int,
  remaining: Int,
) -> List<ByteArray> {
  if remaining <= 0 {
    []
  } else {
    [
      from_int_big_endian(9_000 + next, constants.credential_hash_bytes),
      ..make_allowance_decoy_signatories_from(next + 1, remaining - 1)
    ]
  }
}

fn make_wallet_inputs_from(next: Int, remaining: Int) -> List<Input> {
  if remaining <= 0 {
    []
  } else {
    [
      fixtures.wallet_input(
        wallet_input_reference(next),
        assets.from_lovelace(wallet_input_lovelace),
      ),
      ..make_wallet_inputs_from(next + 1, remaining - 1)
    ]
  }
}

fn make_wallet_redeemers_from(
  next: Int,
  remaining: Int,
) -> Pairs<ScriptPurpose, Redeemer> {
  if remaining <= 0 {
    []
  } else {
    let wallet_redeemer: Data = 0
    [
      Pair(Spend(wallet_input_reference(next)), wallet_redeemer),
      ..make_wallet_redeemers_from(next + 1, remaining - 1)
    ]
  }
}

fn with_spend_redeemers(
  transaction: Transaction,
  wallet_count: Int,
  action: state_types.SttAction,
) -> Transaction {
  let stt_redeemer: Data = action
  Transaction {
    ..transaction,
    redeemers: list.concat(
      make_wallet_redeemers_from(0, wallet_count),
      [Pair(Spend(fixtures.stt_input_ref()), stt_redeemer)],
    ),
  }
}

fn with_saturated_single_wallet_redeemers(
  transaction: Transaction,
  action: state_types.SttAction,
) -> Transaction {
  let external_redeemer: Data = 0
  let wallet_redeemer: Data = 0
  let stt_redeemer: Data = action
  Transaction {
    ..transaction,
    redeemers: [
      Pair(Spend(allowance_decoy_input_reference(0)), external_redeemer),
      Pair(Spend(wallet_input_reference(0)), wallet_redeemer),
      Pair(Spend(fixtures.stt_input_ref()), stt_redeemer),
    ],
  }
}

fn with_governance_withdrawal(
  transaction: Transaction,
  action: state_types.SttAction,
  operator_path: state_types.OperatorPath,
) -> Transaction {
  let stt_redeemer: Data = action
  let wallet_redeemer: Data = operator_path
  let wallet_credential = fixtures.wallet_script_address().payment_credential
  Transaction {
    ..transaction,
    withdrawals: [Pair(wallet_credential, 1)],
    redeemers: [
      Pair(Spend(fixtures.stt_input_ref()), stt_redeemer),
      Pair(Withdraw(wallet_credential), wallet_redeemer),
    ],
  }
}

const max_recovery_state: state_types.State =
  state_types.State {
    ..states.secured_state(
      make_users_from(1, fixture_user_count),
      make_beneficiaries_from(1, fixture_beneficiary_count),
      make_distinct_streaming_payments_from(1, fixture_stream_count, 0),
    ),
    wallet_name: from_int_big_endian(0, constants.max_wallet_name_bytes),
  }

const settled_max_recovery_state: state_types.State =
  state_types.State {
    ..max_recovery_state,
    streaming_payments: settle_streaming_payments(
      max_recovery_state.streaming_payments,
    ),
  }

const max_beneficiary_state: state_types.State =
  state_types.State {
    ..states.secured_state(
      [],
      make_max_width_beneficiaries_from(1, max_beneficiary_fixture_count),
      make_allowance_streaming_payments_from(
        1,
        beneficiary_native_asset_count + 1,
        fixture_stream_count,
      ),
    ),
    wallet_name: from_int_big_endian(0, constants.max_wallet_name_bytes),
  }

const max_state_admin_wallet: ByteArray =
  user_wallet_hash(fixture_user_count, user_wallet_count(fixture_user_count))

const max_state_mint_input_reference: OutputReference =
  fixtures.output_ref(fixtures.tx_id(#"7930"), 0)

const max_state_mint_asset_name: ByteArray =
  stt_io.output_reference_to_asset_name(max_state_mint_input_reference)

const max_state_mint_transaction: Transaction = {
    let mint_redeemer: Data = 0
    Transaction {
      ..fixtures.transaction(
        interval.after(0),
        [],
        [
          fixtures.external_input(
            max_state_mint_input_reference,
            fixtures.address_from_key("funder"),
            assets.from_lovelace(wallet_input_lovelace),
          ),
        ],
        [
          fixtures.stt_output(
            fixtures.default_policy_id(),
            max_recovery_state,
            fixtures.stt_value(
              fixtures.default_policy_id(),
              max_state_mint_asset_name,
              wallet_input_lovelace,
            ),
          ),
        ],
        fixtures.tx_id(#"7931"),
      ),
      mint: assets.from_asset(
        fixtures.default_policy_id(),
        max_state_mint_asset_name,
        1,
      ),
      redeemers: [Pair(Mint(fixtures.default_policy_id()), mint_redeemer)],
    }
  }

const max_state_update_action: state_types.SttAction =
  state_types.RunOperator(
    state_types.OperatorAction {
      path: state_types.Admin,
      kind: state_types.UpdateState,
    },
  )

const max_state_update_transaction: Transaction =
  with_spend_redeemers(
    fixtures.stt_spend_tx(
      interval.between(120, 120),
      [max_state_admin_wallet],
      max_recovery_state,
      max_recovery_state,
      [],
      fixtures.tx_id(#"7a30"),
    ),
    0,
    max_state_update_action,
  )

const scalar_heavy_max_state: state_types.State = {
    let state = states.secured_state(
      scalar_heavy_users(),
      scalar_heavy_beneficiaries(),
      scalar_heavy_streaming_payments(),
    )
    state_types.State {
      ..state,
      access: state_types.AccessControl {
        ..state.access,
        multi_sig_threshold: Some(constants.max_state_integer),
      },
      proof_of_life: state_types.ProofOfLifeSettings {
        unlock_time: Some(constants.max_state_integer),
        increment: Some(constants.max_state_integer),
      },
      wallet_name: from_int_big_endian(0, constants.max_wallet_name_bytes),
      last_non_admin_payout_at: Some(constants.max_state_integer),
    }
  }

const scalar_heavy_max_state_update_transaction: Transaction =
  with_spend_redeemers(
    fixtures.stt_spend_tx(
      interval.between(120, 120),
      [max_state_admin_wallet],
      scalar_heavy_max_state,
      scalar_heavy_max_state,
      [],
      fixtures.tx_id(#"9c30"),
    ),
    0,
    max_state_update_action,
  )

const max_state_manage_streaming_action: state_types.SttAction =
  state_types.RunOperator(
    state_types.OperatorAction {
      path: state_types.Admin,
      kind: state_types.ManageStreamingPayments,
    },
  )

const max_state_manage_streaming_transaction: Transaction =
  with_spend_redeemers(
    fixtures.stt_spend_tx(
      interval.between(120, 120),
      [max_state_admin_wallet],
      max_recovery_state,
      max_recovery_state,
      [],
      fixtures.tx_id(#"7b30"),
    ),
    0,
    max_state_manage_streaming_action,
  )

const beneficiary_actor_wallet: ByteArray =
  from_int_big_endian(fixture_total_beneficiary_wallet_count, 28)

const max_beneficiary_input_value: assets.Value =
  make_distinct_allowance_entries_from(
    1,
    beneficiary_native_asset_count,
    constants.max_state_integer,
  )
    |> asset_entries.value_from_asset_entries

const max_beneficiary_output_value: assets.Value =
  make_distinct_allowance_entries_from(
    1,
    beneficiary_native_asset_count,
    constants.max_state_integer - beneficiary_native_asset_payout_quantity,
  )
    |> asset_entries.value_from_asset_entries

const max_beneficiary_payout_value: assets.Value =
  make_distinct_allowance_entries_from(
    1,
    beneficiary_native_asset_count,
    beneficiary_native_asset_payout_quantity,
  )
    |> asset_entries.value_from_asset_entries

const consolidation_action: state_types.SttAction =
  state_types.Consolidate(state_types.BeneficiaryPath)

const consolidation_transaction: Transaction =
  with_spend_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(constants.max_state_integer, constants.max_state_integer),
      list.concat(
        make_allowance_decoy_signatories_from(
          0,
          allowance_decoy_signatory_count,
        ),
        [beneficiary_actor_wallet],
      ),
      list.concat(
        make_key_decoy_inputs_from(0, consolidation_decoy_input_count),
        list.concat(
          make_wallet_inputs_from(0, consolidation_wallet_input_count),
          [
            fixtures.stt_input(
              fixtures.stt_input_ref(),
              fixtures.default_policy_id(),
              max_beneficiary_state,
              fixtures.default_stt_value(),
            ),
          ],
        ),
      ),
      list.concat(
        make_allowance_decoy_outputs(consolidation_decoy_output_count),
        [
          fixtures.wallet_output(
            assets.from_lovelace(
              consolidation_wallet_input_count * wallet_input_lovelace,
            ),
          ),
          fixtures.stt_output(
            fixtures.default_policy_id(),
            max_beneficiary_state,
            fixtures.default_stt_value(),
          ),
        ],
      ),
      fixtures.tx_id(#"7430"),
      fixtures.stt_input_ref(),
      consolidation_action,
    ),
    consolidation_wallet_input_count,
    consolidation_action,
  )

const beneficiary_use_output_state: state_types.State =
  state_types.State {
    ..max_beneficiary_state,
    access: state_types.AccessControl {
      ..max_beneficiary_state.access,
      beneficiaries: list.take(
        max_beneficiary_state.access.beneficiaries,
        max_beneficiary_fixture_count - 1,
      ),
    },
  }

const beneficiary_use_action: state_types.SttAction =
  state_types.UseBeneficiary(max_beneficiary_actor_id)

const beneficiary_use_transaction: Transaction =
  with_saturated_single_wallet_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(constants.max_state_integer, constants.max_state_integer),
      list.concat(
        make_allowance_decoy_signatories_from(
          0,
          allowance_decoy_signatory_count,
        ),
        [beneficiary_actor_wallet],
      ),
      list.concat(
        make_allowance_decoy_inputs_from(0, allowance_decoy_input_count),
        [
          fixtures.external_input(
            fixtures.output_ref(fixtures.tx_id(#"4530"), 0),
            fixtures.address_from_key("funder"),
            assets.from_lovelace(payout_output_lovelace),
          ),
          fixtures.stt_input(
            fixtures.stt_input_ref(),
            fixtures.default_policy_id(),
            max_beneficiary_state,
            fixtures.default_stt_value(),
          ),
          fixtures.wallet_input(
            wallet_input_reference(0),
            assets.merge(
              assets.from_lovelace(beneficiary_use_input_lovelace),
              max_beneficiary_input_value,
            ),
          ),
        ],
      ),
      list.concat(
        make_allowance_decoy_outputs(allowance_decoy_output_count),
        [
          fixtures.payout_output(
            fixtures.address_from_key(beneficiary_actor_wallet),
            assets.merge(
              assets.from_lovelace(payout_output_lovelace),
              max_beneficiary_payout_value,
            ),
          ),
          fixtures.wallet_output(
            assets.merge(
              assets.from_lovelace(beneficiary_use_input_lovelace),
              max_beneficiary_output_value,
            ),
          ),
          fixtures.stt_output(
            fixtures.default_policy_id(),
            beneficiary_use_output_state,
            fixtures.default_stt_value(),
          ),
        ],
      ),
      fixtures.tx_id(#"7530"),
      fixtures.stt_input_ref(),
      beneficiary_use_action,
    ),
    beneficiary_use_action,
  )

const operator_use_action: state_types.SttAction =
  state_types.RunOperator(
    state_types.OperatorAction {
      path: state_types.Admin,
      kind: state_types.Use,
    },
  )

const max_state_governance_operator_use_transaction: Transaction =
  with_governance_withdrawal(
    fixtures.stt_spend_tx(
      interval.between(120, 120),
      [max_state_admin_wallet],
      max_recovery_state,
      max_recovery_state,
      [],
      fixtures.tx_id(#"7c30"),
    ),
    operator_use_action,
    state_types.Admin,
  )

const operator_use_transaction: Transaction =
  with_spend_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(120, 120),
      [
        user_wallet_hash(
          fixture_user_count,
          user_wallet_count(fixture_user_count),
        ),
      ],
      [
        fixtures.wallet_input(
          wallet_input_reference(0),
          assets.from_lovelace(beneficiary_use_input_lovelace),
        ),
        fixtures.stt_input(
          fixtures.stt_input_ref(),
          fixtures.default_policy_id(),
          max_recovery_state,
          fixtures.default_stt_value(),
        ),
      ],
      [
        fixtures.wallet_output(
          assets.from_lovelace(beneficiary_use_input_lovelace),
        ),
        fixtures.stt_output(
          fixtures.default_policy_id(),
          max_recovery_state,
          fixtures.default_stt_value(),
        ),
      ],
      fixtures.tx_id(#"7730"),
      fixtures.stt_input_ref(),
      operator_use_action,
    ),
    1,
    operator_use_action,
  )

// Reset-time allowance use spends every per-day entry even when the stored
// remaining bundle is smaller. The input and output each keep the aggregate
// cap: five actor per-day entries, five actor remaining entries, and five
// unchanged-user entries. Output actor remaining entries stay at quantity zero.
// Fifteen schedules use distinct assets outside the bounded five-asset wallet
// Value. This maximizes reserve construction and unsuccessful Value lookups.
const max_allowance_state: state_types.State =
  state_types.State {
    ..max_recovery_state,
    access: state_types.AccessControl {
      ..max_recovery_state.access,
      users: make_allowance_scenario_users_from(
        1,
        fixture_user_count,
        allowance_input_remaining_entry_count,
        0,
        payout_time,
      ),
    },
    streaming_payments: make_allowance_streaming_payments_from(
      1,
      allowance_actor_entry_count + 1,
      fixture_stream_count,
    ),
  }

const allowance_output_state: state_types.State =
  state_types.State {
    ..max_allowance_state,
    access: state_types.AccessControl {
      ..max_allowance_state.access,
      users: make_allowance_scenario_users_from(
        1,
        fixture_user_count,
        allowance_input_remaining_entry_count,
        0,
        payout_time + constants.milliseconds_per_day,
      ),
    },
  }

const allowance_spent: state_types.AssetEntries =
  make_distinct_allowance_entries_from(1, allowance_actor_entry_count, 1)

const allowance_spent_value: assets.Value =
  asset_entries.value_from_asset_entries(allowance_spent)

// These policies tune the Plutus Data encoding of this synthetic Value to
// 4,999 bytes. This is an execution-cost fixture, not a ledger Value-size or
// serialized-transaction-size proof.
const near_max_value_padding: assets.Value =
  make_near_max_value_padding_policies_from(
    0,
    near_max_value_padding_policy_count,
  )
    |> assets.from_asset_list

const deep_value_padding: assets.Value =
  make_deep_value_policies_from(1, deep_value_policy_count)
    |> assets.from_asset_list

const allowance_input_value: assets.Value =
  make_distinct_allowance_entries_from(
    1,
    allowance_actor_entry_count,
    allowance_reserve_quantity + 1,
  )
    |> asset_entries.value_from_asset_entries

const allowance_output_value: assets.Value =
  make_distinct_allowance_entries_from(
    1,
    allowance_actor_entry_count,
    allowance_reserve_quantity,
  )
    |> asset_entries.value_from_asset_entries

const allowance_action: state_types.SttAction =
  state_types.UseAllowance(allowance_spent)

const allowance_transaction: Transaction =
  with_saturated_single_wallet_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(payout_time, payout_time),
      list.concat(
        make_allowance_decoy_signatories_from(
          0,
          allowance_decoy_signatory_count,
        ),
        [
          user_wallet_hash(
            fixture_user_count,
            user_wallet_count(fixture_user_count),
          ),
        ],
      ),
      list.concat(
        make_allowance_decoy_inputs_from(0, allowance_decoy_input_count),
        [
          fixtures.external_input(
            fixtures.output_ref(fixtures.tx_id(#"4430"), 0),
            fixtures.address_from_key("funder"),
            assets.from_lovelace(payout_output_lovelace),
          ),
          fixtures.stt_input(
            fixtures.stt_input_ref(),
            fixtures.default_policy_id(),
            max_allowance_state,
            fixtures.default_stt_value(),
          ),
          fixtures.wallet_input(
            wallet_input_reference(0),
            assets.merge(
              assets.from_lovelace(payout_wallet_lovelace),
              allowance_input_value,
            ),
          ),
        ],
      ),
      list.concat(
        make_allowance_decoy_outputs(allowance_decoy_output_count),
        [
          fixtures.payout_output(
            fixtures.address_from_key(payout_payee_hash(99)),
            assets.merge(
              assets.from_lovelace(payout_output_lovelace),
              allowance_spent_value,
            ),
          ),
          fixtures.wallet_output(
            assets.merge(
              assets.from_lovelace(payout_wallet_lovelace),
              allowance_output_value,
            ),
          ),
          fixtures.stt_output(
            fixtures.default_policy_id(),
            allowance_output_state,
            fixtures.default_stt_value(),
          ),
        ],
      ),
      fixtures.tx_id(#"7830"),
      fixtures.stt_input_ref(),
      allowance_action,
    ),
    allowance_action,
  )

const payout_input_state: state_types.State =
  state_types.State {
    ..max_recovery_state,
    streaming_payments: make_distinct_streaming_payments_from(
      1,
      fixture_stream_count,
      0,
    ),
  }

const payout_output_state: state_types.State =
  state_types.State {
    ..payout_input_state,
    streaming_payments: make_distinct_streaming_payments_from(
      1,
      fixture_stream_count,
      payout_batch_count,
    ),
    last_non_admin_payout_at: Some(payout_time),
  }

const payout_value: assets.Value =
  make_payout_value_from(
    fixture_stream_count - payout_batch_count + 1,
    payout_batch_count,
  )

const payout_delta: state_types.AssetEntries =
  payout_value |> asset_entries.flatten_to_entries

const payout_action: state_types.SttAction =
  state_types.PayStreamingPayment(payout_delta)

const payout_transaction: Transaction =
  with_spend_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(payout_time, payout_time),
      [beneficiary_actor_wallet],
      [
        fixtures.wallet_input(
          wallet_input_reference(0),
          assets.merge(
            assets.from_lovelace(payout_wallet_lovelace),
            payout_value,
          ),
        ),
        fixtures.external_input(
          fixtures.output_ref(fixtures.tx_id(#"4330"), 0),
          fixtures.address_from_key("funder"),
          assets.from_lovelace(payout_batch_count * payout_output_lovelace),
        ),
        fixtures.stt_input(
          fixtures.stt_input_ref(),
          fixtures.default_policy_id(),
          payout_input_state,
          fixtures.default_stt_value(),
        ),
      ],
      list.concat(
        [fixtures.wallet_output(assets.from_lovelace(payout_wallet_lovelace))],
        list.concat(
          make_tagged_payout_outputs_from(
            fixture_stream_count - payout_batch_count + 1,
            payout_batch_count,
          ),
          [
            fixtures.stt_output(
              fixtures.default_policy_id(),
              payout_output_state,
              fixtures.default_stt_value(),
            ),
          ],
        ),
      ),
      fixtures.tx_id(#"7630"),
      fixtures.stt_input_ref(),
      payout_action,
    ),
    1,
    payout_action,
  )

// PayStreamingPayment intentionally has no native-asset row cap. The 4,999-byte
// shape assertion below covers only the ADA-plus-padding Plutus Data CBOR
// baseline. This payout fixture adds two payout assets and leaves the padding
// unchanged while those declared assets leave the wallet. It is a deliberately
// oversized synthetic execution-cost upper bound, not a ledger Value or full
// transaction feasibility proof.
const oversized_value_pay_streaming_transaction: Transaction =
  with_spend_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(payout_time, payout_time),
      [beneficiary_actor_wallet],
      [
        fixtures.wallet_input(
          wallet_input_reference(0),
          assets.merge(
            assets.merge(
              assets.from_lovelace(payout_wallet_lovelace),
              payout_value,
            ),
            near_max_value_padding,
          ),
        ),
        fixtures.external_input(
          fixtures.output_ref(fixtures.tx_id(#"9d31"), 0),
          fixtures.address_from_key("funder"),
          assets.from_lovelace(payout_batch_count * payout_output_lovelace),
        ),
        fixtures.stt_input(
          fixtures.stt_input_ref(),
          fixtures.default_policy_id(),
          payout_input_state,
          fixtures.default_stt_value(),
        ),
      ],
      list.concat(
        [
          fixtures.wallet_output(
            assets.merge(
              assets.from_lovelace(payout_wallet_lovelace),
              near_max_value_padding,
            ),
          ),
        ],
        list.concat(
          make_tagged_payout_outputs_from(
            fixture_stream_count - payout_batch_count + 1,
            payout_batch_count,
          ),
          [
            fixtures.stt_output(
              fixtures.default_policy_id(),
              payout_output_state,
              fixtures.default_stt_value(),
            ),
          ],
        ),
      ),
      fixtures.tx_id(#"9d30"),
      fixtures.stt_input_ref(),
      payout_action,
    ),
    1,
    payout_action,
  )

const oversized_wallet_value: assets.Value =
  assets.merge(
    assets.from_lovelace(payout_wallet_lovelace),
    near_max_value_padding,
  )

const deep_lookup_wallet_value: assets.Value =
  assets.merge(assets.from_lovelace(payout_wallet_lovelace), deep_value_padding)

// Operator Use remains the owner-authorized cleanup path for an unsolicited
// over-cap UTxO. This fixture measures the recovery transaction after every
// streaming obligation is settled, so the known-empty reserve is skipped.
const oversized_value_operator_use_cleanup_transaction: Transaction =
  with_spend_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(120, 120),
      [max_state_admin_wallet],
      [
        fixtures.wallet_input(
          wallet_input_reference(0),
          deep_lookup_wallet_value,
        ),
        fixtures.stt_input(
          fixtures.stt_input_ref(),
          fixtures.default_policy_id(),
          settled_max_recovery_state,
          fixtures.default_stt_value(),
        ),
      ],
      [
        fixtures.payout_output(
          fixtures.address_from_key("owner"),
          deep_lookup_wallet_value,
        ),
        fixtures.stt_output(
          fixtures.default_policy_id(),
          settled_max_recovery_state,
          fixtures.default_stt_value(),
        ),
      ],
      fixtures.tx_id(#"9e30"),
      fixtures.stt_input_ref(),
      operator_use_action,
    ),
    1,
    operator_use_action,
  )

const terminal_beneficiary_wallet: ByteArray =
  fixtures.key_hash("terminal-beneficiary")

const terminal_beneficiary_input_state: state_types.State =
  states.base_state()
    |> states.with_beneficiaries(
        [
          state_types.Beneficiary {
            ..states.base_beneficiary(),
            id: beneficiary_actor_id,
            beneficiary_wallets: [terminal_beneficiary_wallet],
            unlock_after: Some(100),
          },
        ],
      )
    |> states.with_proof_of_life(100, 50)

const terminal_beneficiary_output_state: state_types.State =
  state_types.State {
    ..terminal_beneficiary_input_state,
    access: state_types.AccessControl {
      ..terminal_beneficiary_input_state.access,
      beneficiaries: [],
    },
  }

const terminal_beneficiary_action: state_types.SttAction =
  state_types.UseBeneficiary(beneficiary_actor_id)

// This terminal fixture co-fires one wallet input and drains its full value
// because the output State has no remaining access path. It does not prove
// recovery across several wallet pools.
const oversized_value_terminal_beneficiary_sweep_transaction: Transaction =
  with_spend_redeemers(
    fixtures.transaction_with_stt_redeemer(
      interval.between(120, 120),
      [terminal_beneficiary_wallet],
      [
        fixtures.wallet_input(wallet_input_reference(0), oversized_wallet_value),
        fixtures.stt_input(
          fixtures.stt_input_ref(),
          fixtures.default_policy_id(),
          terminal_beneficiary_input_state,
          fixtures.default_stt_value(),
        ),
      ],
      [
        fixtures.payout_output(
          fixtures.address_from_key("terminal-beneficiary"),
          oversized_wallet_value,
        ),
        fixtures.stt_output(
          fixtures.default_policy_id(),
          terminal_beneficiary_output_state,
          fixtures.default_stt_value(),
        ),
      ],
      fixtures.tx_id(#"9f30"),
      fixtures.stt_input_ref(),
      terminal_beneficiary_action,
    ),
    1,
    terminal_beneficiary_action,
  )

const wallet_input_reference_00: OutputReference = wallet_input_reference(0)

const wallet_input_reference_01: OutputReference = wallet_input_reference(1)

// Bind the validator parameters shared by every wallet leg. Each test supplies
// only the consumed wallet reference and the transaction under measurement.
fn run_wallet_spend(own_ref: OutputReference, transaction: Transaction) -> Bool {
  wallet.eval_spend(
    fixtures.default_policy_id(),
    fixtures.default_asset_name(),
    None,
    0,
    own_ref,
    transaction,
  )
}

fn wallet_spend_execution_count(transaction: Transaction) -> Int {
  let wallet_credential = fixtures.wallet_script_address().payment_credential
  list.foldl(
    transaction.inputs,
    0,
    fn(input, count) {
      if input.output.address.payment_credential == wallet_credential {
        count + 1
      } else {
        count
      }
    },
  )
}

fn wallet_governance_execution_count(transaction: Transaction) -> Int {
  let wallet_credential = fixtures.wallet_script_address().payment_credential
  list.foldl(
    transaction.redeemers,
    0,
    fn(redeemer, count) {
      let Pair(purpose, _) = redeemer
      when purpose is {
        Withdraw(credential) ->
          if credential == wallet_credential {
            count + 1
          } else {
            count
          }
        _ -> count
      }
    },
  )
}

fn wallet_execution_count(transaction: Transaction) -> Int {
  wallet_spend_execution_count(transaction) + wallet_governance_execution_count(
    transaction,
  )
}

test fixture_shape_declared_wallet_execution_counts_match() {
  let encoded_oversized_value: Data = oversized_wallet_value
  let encoded_deep_value: Data = deep_lookup_wallet_value
  expect
    bytearray.length(cbor.serialise(encoded_oversized_value)) == near_max_value_encoded_bytes
  expect
    bytearray.length(cbor.serialise(encoded_deep_value)) >= deep_value_min_encoded_bytes
  expect
    bytearray.length(cbor.serialise(encoded_deep_value)) <= target_value_max_encoded_bytes
  expect list.length(scalar_heavy_max_state.access.users) == fixture_user_count
  expect
    list.length(scalar_heavy_max_state.access.beneficiaries) == fixture_beneficiary_count
  expect
    list.length(scalar_heavy_max_state.streaming_payments) == fixture_stream_count
  expect
    list.length(scalar_heavy_max_state.access.users) + list.length(
      scalar_heavy_max_state.access.beneficiaries,
    ) == constants.max_access_records
  expect
    state_allowance.total_allowance_entry_count(
      scalar_heavy_max_state.access.users,
    ) == fixture_total_allowance_entry_count
  expect
    list.foldl(
      scalar_heavy_max_state.access.users,
      0,
      fn(user, total) { total + list.length(user.user_wallets) },
    ) == fixture_total_user_wallet_count
  expect
    list.foldl(
      scalar_heavy_max_state.access.beneficiaries,
      0,
      fn(beneficiary, total) {
        total + list.length(beneficiary.beneficiary_wallets)
      },
    ) == fixture_total_beneficiary_wallet_count
  expect
    (
      allowance_input_value
        |> assets.without_lovelace
        |> assets.flatten
        |> list.length
    ) == constants.max_bounded_wallet_native_assets
  expect
    (
      allowance_output_value
        |> assets.without_lovelace
        |> assets.flatten
        |> list.length
    ) == constants.max_bounded_wallet_native_assets
  expect
    list.length(allowance_transaction.inputs) == constants.max_transaction_inputs
  expect
    list.length(allowance_transaction.outputs) == constants.max_transaction_outputs
  expect
    list.length(allowance_transaction.extra_signatories) == constants.max_transaction_signatories
  expect
    list.length(allowance_transaction.redeemers) == constants.max_transaction_redeemers
  expect
    list.length(consolidation_transaction.inputs) == constants.max_transaction_inputs
  expect
    list.length(consolidation_transaction.outputs) == constants.max_transaction_outputs
  expect
    list.length(consolidation_transaction.extra_signatories) == constants.max_transaction_signatories
  expect
    list.length(consolidation_transaction.redeemers) == constants.max_transaction_redeemers
  expect
    list.length(beneficiary_use_transaction.inputs) == constants.max_transaction_inputs
  expect
    list.length(beneficiary_use_transaction.outputs) == constants.max_transaction_outputs
  expect
    list.length(beneficiary_use_transaction.extra_signatories) == constants.max_transaction_signatories
  expect
    list.length(beneficiary_use_transaction.redeemers) == constants.max_transaction_redeemers
  expect
    list.length(payout_delta) == constants.max_streaming_payouts_per_transaction
  expect
    list.length(settled_max_recovery_state.streaming_payments) == constants.max_streaming_payments
  expect
    list.all(
      settled_max_recovery_state.streaming_payments,
      fn(payment) { payment.paid_out_amount == funding.lifetime_total(payment) },
    )
  expect wallet_execution_count(max_state_mint_transaction) == 0
  expect wallet_execution_count(max_state_update_transaction) == 0
  expect wallet_execution_count(scalar_heavy_max_state_update_transaction) == 0
  expect wallet_execution_count(max_state_manage_streaming_transaction) == 0
  expect
    wallet_execution_count(max_state_governance_operator_use_transaction) == 1
  expect wallet_execution_count(consolidation_transaction) == 2
  expect wallet_execution_count(beneficiary_use_transaction) == 1
  expect wallet_execution_count(operator_use_transaction) == 1
  expect wallet_execution_count(allowance_transaction) == 1
  expect wallet_execution_count(payout_transaction) == 1
  expect wallet_execution_count(oversized_value_pay_streaming_transaction) == 1
  expect
    wallet_execution_count(oversized_value_operator_use_cleanup_transaction) == 1
  expect
    wallet_execution_count(
      oversized_value_terminal_beneficiary_sweep_transaction,
    ) == 1
}

test max_state_mint_w00__stt() {
  expect
    stt.eval_mint(0, fixtures.default_policy_id(), max_state_mint_transaction)
}

test max_state_update_w00__stt() {
  expect
    stt.eval_spend(
      None,
      max_state_update_action,
      fixtures.stt_input_ref(),
      max_state_update_transaction,
    )
}

test scalar_heavy_max_state_update_w00__stt() {
  expect
    stt.eval_spend(
      None,
      max_state_update_action,
      fixtures.stt_input_ref(),
      scalar_heavy_max_state_update_transaction,
    )
}

test max_state_manage_streaming_w00__stt() {
  expect
    stt.eval_spend(
      None,
      max_state_manage_streaming_action,
      fixtures.stt_input_ref(),
      max_state_manage_streaming_transaction,
    )
}

test max_state_governance_operator_use_w01__stt() {
  expect
    stt.eval_spend(
      None,
      operator_use_action,
      fixtures.stt_input_ref(),
      max_state_governance_operator_use_transaction,
    )
}

test max_state_governance_operator_use_w01__wallet_00() {
  expect
    wallet.eval_governance_operator_use(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      state_types.Admin,
      max_state_governance_operator_use_transaction,
    )
}

test max_recovery_consolidation_w02__stt() {
  expect
    stt.eval_spend(
      None,
      consolidation_action,
      fixtures.stt_input_ref(),
      consolidation_transaction,
    )
}

test max_recovery_consolidation_w02__wallet_00() {
  expect run_wallet_spend(wallet_input_reference_00, consolidation_transaction)
}

test max_recovery_consolidation_w02__wallet_01() {
  expect run_wallet_spend(wallet_input_reference_01, consolidation_transaction)
}

test max_recovery_use_beneficiary_w01__stt() {
  expect
    stt.eval_spend(
      None,
      beneficiary_use_action,
      fixtures.stt_input_ref(),
      beneficiary_use_transaction,
    )
}

test max_recovery_use_beneficiary_w01__wallet_00() {
  expect
    run_wallet_spend(wallet_input_reference_00, beneficiary_use_transaction)
}

test max_state_operator_use_w01__stt() {
  expect
    stt.eval_spend(
      None,
      operator_use_action,
      fixtures.stt_input_ref(),
      operator_use_transaction,
    )
}

test max_state_operator_use_w01__wallet_00() {
  expect run_wallet_spend(wallet_input_reference_00, operator_use_transaction)
}

test max_state_use_allowance_w01__stt() {
  expect
    stt.eval_spend(
      None,
      allowance_action,
      fixtures.stt_input_ref(),
      allowance_transaction,
    )
}

test max_state_use_allowance_w01__wallet_00() {
  expect run_wallet_spend(wallet_input_reference_00, allowance_transaction)
}

test max_state_distinct_asset_payout_w01__stt() {
  expect
    stt.eval_spend(
      None,
      payout_action,
      fixtures.stt_input_ref(),
      payout_transaction,
    )
}

test max_state_distinct_asset_payout_w01__wallet_00() {
  expect run_wallet_spend(wallet_input_reference_00, payout_transaction)
}

test oversized_value_pay_streaming_w01__stt() {
  expect
    stt.eval_spend(
      None,
      payout_action,
      fixtures.stt_input_ref(),
      oversized_value_pay_streaming_transaction,
    )
}

test oversized_value_pay_streaming_w01__wallet_00() {
  expect
    run_wallet_spend(
      wallet_input_reference_00,
      oversized_value_pay_streaming_transaction,
    )
}

test oversized_value_operator_use_cleanup_w01__stt() {
  expect
    stt.eval_spend(
      None,
      operator_use_action,
      fixtures.stt_input_ref(),
      oversized_value_operator_use_cleanup_transaction,
    )
}

test oversized_value_operator_use_cleanup_w01__wallet_00() {
  expect
    run_wallet_spend(
      wallet_input_reference_00,
      oversized_value_operator_use_cleanup_transaction,
    )
}

test oversized_value_terminal_beneficiary_sweep_w01__stt() {
  expect
    stt.eval_spend(
      None,
      terminal_beneficiary_action,
      fixtures.stt_input_ref(),
      oversized_value_terminal_beneficiary_sweep_transaction,
    )
}

test oversized_value_terminal_beneficiary_sweep_w01__wallet_00() {
  expect
    run_wallet_spend(
      wallet_input_reference_00,
      oversized_value_terminal_beneficiary_sweep_transaction,
    )
}
