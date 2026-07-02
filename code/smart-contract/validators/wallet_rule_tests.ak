//// Rule-level wallet tests. These drive the `wallet/rules` library directly
//// (via the `helpers.allows_spend` adapter or `wallet_rules.stt_action_allows_spend`)
//// without invoking the wallet validator: operator-path power, witnessed
//// payout limits, consolidation value-preservation, weighted beneficiary
//// shares, and streaming-payment payout deltas.

use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use state/authorization as state_authorization
use state/types as state_types
use test_support/security_fixtures as fixtures
use test_support/wallet_test_helpers as helpers
use wallet/rules as wallet_rules

test multisig_operator_path_accepts_required_power() {
  let state = helpers.mk_state([fixtures.multisig_user(1, "user1", 2)], [])

  let transaction = fixtures.transaction(
    interval.after(0),
    ["user1"],
    [],
    [],
    #"2230000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    state_authorization.has_operator_authority(
      transaction,
      state,
      state_types.Multisig,
    )
}

test witnessed_payout_must_fit_allowed_asset_amounts() {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(2_000_000),
    output_value: assets.from_lovelace(1_000_000),
    paid_out_value: assets.from_lovelace(1_000_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.UseAllowance(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

test witnessed_payout_rejects_amounts_above_limit() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(2_000_000),
    output_value: assets.from_lovelace(999_999),
    paid_out_value: assets.from_lovelace(1_000_001),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.UseAllowance(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

test consolidation_requires_identical_wallet_value() {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(#"aa", #"01", 10),
    ),
    output_value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(#"aa", #"01", 10),
    ),
    paid_out_value: assets.zero,
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.Consolidate(state_types.AdminPath),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

test consolidation_rejects_changed_wallet_value() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(#"aa", #"01", 10),
    ),
    output_value: assets.merge(
      assets.from_lovelace(2_000_001),
      assets.from_asset(#"aa", #"01", 10),
    ),
    paid_out_value: assets.zero,
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.Consolidate(state_types.AdminPath),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

test witnessed_payout_rejects_amounts_below_exact_allowance() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(2_000_000),
    output_value: assets.from_lovelace(1_100_000),
    paid_out_value: assets.from_lovelace(900_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.UseAllowance(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

test witnessed_payout_rejects_extra_asset_drift() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(#"aa", #"02", 5),
    ),
    output_value: assets.merge(
      assets.from_lovelace(1_000_000),
      assets.from_asset(#"aa", #"02", 4),
    ),
    paid_out_value: assets.merge(
      assets.from_lovelace(1_000_000),
      assets.from_asset(#"aa", #"02", 1),
    ),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.UseAllowance(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

// b7 has weight 3 of a total weight of 10 (b7=3, b8=7), so its share is 3/10
// of every asset in the pool. With a 10 ADA / 10-token pool, taking exactly
// 3 ADA + 3 tokens is at the share boundary and is accepted.
test beneficiary_rule_accepts_payout_within_weighted_share() {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.merge(
      assets.from_lovelace(10_000_000),
      assets.from_asset(#"aa", #"02", 10),
    ),
    output_value: assets.merge(
      assets.from_lovelace(7_000_000),
      assets.from_asset(#"aa", #"02", 7),
    ),
    paid_out_value: assets.merge(
      assets.from_lovelace(3_000_000),
      assets.from_asset(#"aa", #"02", 3),
    ),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.UseBeneficiary(7),
      helpers.mk_state(
        [],
        [helpers.mk_beneficiary(7, 3), helpers.mk_beneficiary(8, 7)],
      ),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

test beneficiary_rule_rejects_unknown_beneficiary_id() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(2_000_000),
    output_value: assets.from_lovelace(1_000_000),
    paid_out_value: assets.from_lovelace(1_000_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.UseBeneficiary(99),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

// b7's share of a 10 ADA pool at weight 3/10 is 3 ADA; taking 4 ADA exceeds it
// and is rejected.
test beneficiary_rule_rejects_payout_above_weighted_share() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(10_000_000),
    output_value: assets.from_lovelace(6_000_000),
    paid_out_value: assets.from_lovelace(4_000_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.UseBeneficiary(7),
      helpers.mk_state(
        [],
        [helpers.mk_beneficiary(7, 3), helpers.mk_beneficiary(8, 7)],
      ),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

// A sole beneficiary (weight 5 of total 5) may sweep the entire pool — this is
// the full non-admin recovery path.
test beneficiary_rule_accepts_full_pool_for_sole_beneficiary() {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(10_000_000),
    output_value: assets.zero,
    paid_out_value: assets.from_lovelace(10_000_000),
    input_count: 1,
    output_count: 0,
  }

  expect
    helpers.allows_spend(
      state_types.UseBeneficiary(7),
      helpers.mk_state([], [helpers.mk_beneficiary(7, 5)]),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

// The streaming-payment reserve is subtracted from the pool before the share
// is applied: a sole beneficiary (weight 1) over a 10 ADA wallet with a 4 ADA
// reserve may take up to 6 ADA — exactly 6 is accepted, 7 is rejected. These
// call the rule directly to supply a non-zero reserve.
test beneficiary_rule_accepts_share_of_pool_net_of_reserve() {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(10_000_000),
    output_value: assets.from_lovelace(4_000_000),
    paid_out_value: assets.from_lovelace(6_000_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    wallet_rules.stt_action_allows_spend(
      state_types.UseBeneficiary(7),
      helpers.mk_state([], [helpers.mk_beneficiary(7, 1)]),
      wallet_values,
      assets.from_lovelace(4_000_000),
      wallet_rules.OutputContext {
        wallet_address: fixtures.wallet_script_address(),
        stt_input_reference: fixtures.stt_input_ref(),
        stt_address: fixtures.stt_address(fixtures.default_policy_id()),
        outputs: [],
      },
    )
}

test beneficiary_rule_rejects_drawing_into_streaming_reserve() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(10_000_000),
    output_value: assets.from_lovelace(3_000_000),
    paid_out_value: assets.from_lovelace(7_000_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    wallet_rules.stt_action_allows_spend(
      state_types.UseBeneficiary(7),
      helpers.mk_state([], [helpers.mk_beneficiary(7, 1)]),
      wallet_values,
      assets.from_lovelace(4_000_000),
      wallet_rules.OutputContext {
        wallet_address: fixtures.wallet_script_address(),
        stt_input_reference: fixtures.stt_input_ref(),
        stt_address: fixtures.stt_address(fixtures.default_policy_id()),
        outputs: [],
      },
    )
}

test streaming_payment_payout_rule_accepts_exact_delta() {
  let payout_delta = assets.from_lovelace(1_000_000)
    |> asset_entries.flatten_to_entries
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(5_000_000),
    output_value: assets.from_lovelace(4_000_000),
    paid_out_value: assets.from_lovelace(1_000_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.PayStreamingPayment(payout_delta),
      fixtures.streaming_payment_payout_state(1_000_000),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [
        fixtures.tagged_streaming_payment_output(
          fixtures.address_from_key("beneficiary1"),
          assets.from_lovelace(1_000_000),
          fixtures.stt_input_ref(),
          1,
        ),
      ],
    )
}

test streaming_payment_payout_rule_rejects_mismatched_delta() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(5_000_000),
    output_value: assets.from_lovelace(3_500_000),
    paid_out_value: assets.from_lovelace(1_500_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.PayStreamingPayment(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

test consolidation_rejects_changed_native_asset_value() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(#"aa", #"01", 10),
    ),
    output_value: assets.merge(
      assets.from_lovelace(2_000_000),
      assets.from_asset(#"aa", #"01", 9),
    ),
    paid_out_value: assets.from_asset(#"aa", #"01", 1),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.Consolidate(state_types.AdminPath),
      helpers.mk_state([], []),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [],
    )
}

// A permissionless cranker's own fee-CHANGE output (untagged, third-party,
// lovelace only) is REJECTED on an ADA-denominated payout: every output carries
// min-ADA, so a change output carries the payout lovelace and is an illegal
// destination under the airtight anti-leak scan. The cranker must instead burn
// its funding input into the tx fee (fee == input, no change output) — the
// intentional "ADA settlement fee funding" constraint. Codifies the resolution
// of the change-output question (security review 2026-07): the anti-leak /
// double-satisfaction guarantee is kept airtight rather than exempting lovelace.
test streaming_payment_payout_rule_rejects_cranker_lovelace_change_output() fail {
  let payout_delta = assets.from_lovelace(1_000_000)
    |> asset_entries.flatten_to_entries
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(5_000_000),
    output_value: assets.from_lovelace(4_000_000),
    paid_out_value: assets.from_lovelace(1_000_000),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.PayStreamingPayment(payout_delta),
      fixtures.streaming_payment_payout_state(1_000_000),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [
        fixtures.tagged_streaming_payment_output(
          fixtures.address_from_key("beneficiary1"),
          assets.from_lovelace(1_000_000),
          fixtures.stt_input_ref(),
          1,
        ),
        // The cranker's change: untagged, non-payee, lovelace only — illegal.
        fixtures.payout_output(
          fixtures.address_from_key("cranker"),
          assets.from_lovelace(5_000_000),
        ),
      ],
    )
}

// A NON-lovelace payout asset carried
// by any output that is not the wallet, the STT, or a correctly-tagged payee
// output is an unauthorized leak and rejects the spend, even when the
// tagged payee output is otherwise exact.
test streaming_payment_payout_rule_rejects_untagged_token_output() fail {
  let token_state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        0,
        #"aa",
        #"02",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  )
  let payout_delta = assets.from_asset(#"aa", #"02", 10)
    |> asset_entries.flatten_to_entries
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.merge(
      assets.from_lovelace(5_000_000),
      assets.from_asset(#"aa", #"02", 20),
    ),
    output_value: assets.merge(
      assets.from_lovelace(5_000_000),
      assets.from_asset(#"aa", #"02", 10),
    ),
    paid_out_value: assets.from_asset(#"aa", #"02", 10),
    input_count: 1,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.PayStreamingPayment(payout_delta),
      token_state,
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [
        fixtures.tagged_streaming_payment_output(
          fixtures.address_from_key("beneficiary1"),
          assets.from_asset(#"aa", #"02", 10),
          fixtures.stt_input_ref(),
          1,
        ),
        // Attacker output smuggling the payout token — must stay rejected.
        fixtures.payout_output(
          fixtures.address_from_key("attacker"),
          assets.merge(
            assets.from_lovelace(2_000_000),
            assets.from_asset(#"aa", #"02", 3),
          ),
        ),
      ],
    )
}

// Anti-fragmentation: a permissionless crank may not split the wallet's funds
// into MORE continuing UTxOs than it consumed — everything else about this
// spend is valid (exact delta, exact tagged sum), only the output count grows.
test streaming_payment_payout_rule_rejects_wallet_utxo_fragmentation() fail {
  let payout_delta = assets.from_lovelace(1_000_000)
    |> asset_entries.flatten_to_entries
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(5_000_000),
    output_value: assets.from_lovelace(4_000_000),
    paid_out_value: assets.from_lovelace(1_000_000),
    input_count: 1,
    output_count: 2,
  }

  expect
    helpers.allows_spend(
      state_types.PayStreamingPayment(payout_delta),
      fixtures.streaming_payment_payout_state(1_000_000),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [
        fixtures.tagged_streaming_payment_output(
          fixtures.address_from_key("beneficiary1"),
          assets.from_lovelace(1_000_000),
          fixtures.stt_input_ref(),
          1,
        ),
      ],
    )
}

// Positive control for the anti-fragmentation bound: consuming two wallet
// UTxOs into one continuing output (count shrinks) stays a valid crank.
test streaming_payment_payout_rule_accepts_wallet_utxo_merge() {
  let payout_delta = assets.from_lovelace(1_000_000)
    |> asset_entries.flatten_to_entries
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(5_000_000),
    output_value: assets.from_lovelace(4_000_000),
    paid_out_value: assets.from_lovelace(1_000_000),
    input_count: 2,
    output_count: 1,
  }

  expect
    helpers.allows_spend(
      state_types.PayStreamingPayment(payout_delta),
      fixtures.streaming_payment_payout_state(1_000_000),
      wallet_values,
      fixtures.wallet_script_address(),
      fixtures.stt_input_ref(),
      fixtures.stt_address(fixtures.default_policy_id()),
      [
        fixtures.tagged_streaming_payment_output(
          fixtures.address_from_key("beneficiary1"),
          assets.from_lovelace(1_000_000),
          fixtures.stt_input_ref(),
          1,
        ),
      ],
    )
}
