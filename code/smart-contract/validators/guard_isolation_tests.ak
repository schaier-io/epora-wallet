//// Guard-isolation regression tests (mutation-hardening).
////
//// Each test starts from a transaction the suite already accepts, then violates
//// exactly ONE security guard, leaving every other guard satisfiable — so the
//// rejection can come ONLY from the targeted guard. A guard that has a passing
//// `fail` test elsewhere may still be UNTESTED in isolation when some sibling
//// guard rejects the same vector first; these tests close those tautology gaps
//// found by a mutation sweep (weaken one guard, re-run the suite, look for any
//// guard whose weakening no test catches). The label by each test names the guard
//// it pins. Every guard here was confirmed: with the guard weakened to always-pass,
//// exactly the named test flips from reject to accept.

use aiken/interval
use assets/entries as asset_entries
use cardano/address.{VerificationKey}
use cardano/assets
use cardano/transaction.{Output}
use state/types as state_types
use stt
use stt/io as io
use test_support/security_fixtures as fixtures
use test_support/stt_test_helpers.{admin_state, mint_transaction}
use test_support/wallet_test_helpers as helpers
use wallet/rules as wallet_rules

// ---------------------------------------------------------------------------
// stt.refscript_or — a non-admin spend may not attach a reference script to the
// continuing STT output (only an admin operator action may, to re-host the STT
// reference script). Consolidate(AdminPath) is otherwise fully valid here
// (authority + value + state all preserved), so the reference-script guard is the
// SOLE reason for rejection. The existing reference-script `fail` test uses a
// `RenewProofOfLife` with no eligible signer, so its rejection actually comes from
// the renewal-signature check, not this guard — hence this isolating case.
// ---------------------------------------------------------------------------

test consolidate_rejects_reference_script_on_continuing_output() fail {
  let state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let input = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
  let output = Output {
    ..fixtures.stt_output(
      fixtures.default_policy_id(),
      state,
      fixtures.default_stt_value(),
    ),
    reference_script: Some(#"01"),
  }
  let transaction = fixtures.transaction(
    interval.between(110, 120),
    ["admin"],
    [input],
    [output],
    #"7f10000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.Consolidate(state_types.AdminPath),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// ---------------------------------------------------------------------------
// UseBeneficiary state-preservation (state_unchanged_except_beneficiary_removed):
// the only mutation allowed is removing the acting beneficiary. multi_sig_threshold,
// streaming_payments and wallet_name must all stay equal. Each test removes the
// beneficiary correctly (so the removal/users/pol conjuncts pass) but also touches
// ONE other field, isolating that conjunct.
// ---------------------------------------------------------------------------

fn beneficiary_use_base_input() -> state_types.State {
  fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
}

// pres.ben.threshold
test beneficiary_use_rejects_multisig_threshold_mutation() fail {
  let input_state = beneficiary_use_base_input()
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: input_state.access.users,
      multi_sig_threshold: Some(3),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    #"7a10000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// pres.ben.subs
test beneficiary_use_rejects_streaming_payment_mutation() fail {
  let input_state = beneficiary_use_base_input()
  let injected = fixtures.streaming_payment(
    1,
    fixtures.address_from_key("beneficiary1"),
    0,
    #"",
    #"",
    1_000_000,
    0,
    259_200_000,
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: input_state.access.users,
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
    streaming_payments: [injected],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    #"7a20000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// pres.ben.name
test beneficiary_use_rejects_wallet_name_mutation() fail {
  let input_state = beneficiary_use_base_input()
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: input_state.access.users,
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
    wallet_name: #"6e6577",
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    #"7a30000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// sh.useben.declared_id — the redeemer's declared beneficiary id must equal the
// beneficiary the signature/unlock actually selects. Here only id 7 is eligible
// and is correctly removed, but the redeemer declares 8.
test beneficiary_use_rejects_declared_id_mismatch() fail {
  let input_state = beneficiary_use_base_input()
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: input_state.access.users,
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1"],
    input_state,
    output_state,
    [],
    #"7a40000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(8),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// au.single_beneficiary — exactly ONE beneficiary may hold unlock authority. Two
// distinct beneficiaries are both unlocked and both sign; the output correctly
// removes the declared one (id 7), so only the "exactly one" guard rejects.
test beneficiary_use_rejects_two_simultaneously_eligible() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [
      fixtures.default_beneficiary(7, "beneficiary1", Some(100)),
      fixtures.default_beneficiary(8, "beneficiary2", Some(100)),
    ],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: input_state.access.users,
      multi_sig_threshold: Some(2),
      beneficiaries: [
        fixtures.default_beneficiary(8, "beneficiary2", Some(100)),
      ],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["beneficiary1", "beneficiary2"],
    input_state,
    output_state,
    [],
    #"7a50000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// au.ben.signed — an unlocked beneficiary that does NOT sign holds no authority.
// Same vector as the accept test but with no signatory.
test beneficiary_use_rejects_unsigned_unlocked_beneficiary() fail {
  let input_state = beneficiary_use_base_input()
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: input_state.access.users,
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    [],
    input_state,
    output_state,
    [],
    #"7a60000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// Beneficiary-wallet distinctness on the SPEND path. Two unlocked beneficiaries
// share a wallet; the acting one's authority check runs
// `expect_beneficiary_wallets_are_distinct_from_others`, which fails the tx via
// its internal `expect`. (This pins the distinctness PROTECTION on the spend path;
// the `beneficiary_wallets_distinct` conjunct itself is redundant with that
// internal `expect`, so the conjunct is decorative — audit note.)
test beneficiary_use_rejects_unlocked_shared_wallet_overlap() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [
      fixtures.beneficiary(7, ["shared"], Some(100), 1),
      fixtures.beneficiary(8, ["shared"], Some(100), 1),
    ],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: input_state.access.users,
      multi_sig_threshold: Some(2),
      beneficiaries: [fixtures.beneficiary(8, ["shared"], Some(100), 1)],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.after(120),
    ["shared"],
    input_state,
    output_state,
    [],
    #"7a70000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// ---------------------------------------------------------------------------
// SetIntendedStakeCredential — the forwarded field must equal the redeemer's
// declared target. Here authority and single-field preservation both hold; the
// output stores a DIFFERENT credential than the redeemer declares.
// ---------------------------------------------------------------------------

// sh.setstake.target_eq
test set_intended_stake_rejects_output_credential_mismatch() fail {
  let input_state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let declared_target = VerificationKey(#"57")
  let stored_credential = VerificationKey(#"58")
  let output_state = state_types.State {
    ..input_state,
    intended_stake_credential: Some(stored_credential),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"7b10000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.SetIntendedStakeCredential(Some(declared_target)),
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// ---------------------------------------------------------------------------
// UseAllowance.
// ---------------------------------------------------------------------------

fn spent_user1() -> state_types.User {
  state_types.User {
    ..fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False),
    remaining_allowance: assets.from_lovelace(400_000)
      |> asset_entries.flatten_to_entries,
    next_allowance_reset: 86_400_110,
  }
}

// sh.alw.declared_eq — the redeemer's declared spent-allowance must equal the
// delta implied by the state diff (here the diff spends 600_000, declared 500_000).
test allowance_use_rejects_declared_spent_mismatch() fail {
  let input_state = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: [spent_user1()],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    input_state,
    output_state,
    [],
    #"7c10000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseAllowance(
        assets.from_lovelace(500_000) |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// al.lockstep_len — an allowance-use may not insert or remove users. Here the
// output keeps the (validly spent) user1 AND injects a brand-new admin; the
// lockstep length check is the only thing that rejects the privilege injection.
test allowance_use_rejects_user_injection() fail {
  let input_state = fixtures.secured_state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 86_400_000, False)],
    [],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: [spent_user1(), fixtures.admin_user("injected")],
      multi_sig_threshold: Some(2),
      beneficiaries: [],
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 110),
    ["user1"],
    input_state,
    output_state,
    [],
    #"7c20000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.UseAllowance(
        assets.from_lovelace(600_000) |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// ---------------------------------------------------------------------------
// PayStreamingPayment crank.
// ---------------------------------------------------------------------------

fn crank_input_state() -> state_types.State {
  fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [],
    [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        259_200_000,
      ),
    ],
  )
}

// sh.pay.declared_delta — the redeemer's declared payout delta must equal the
// delta the state diff implies (here the diff pays 1_000_000, declared 2_000_000).
test pay_streaming_rejects_declared_delta_mismatch() fail {
  let input_state = crank_input_state()
  let output_state = state_types.State {
    ..input_state,
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
    last_permissionless_payout_at: Some(86_400_000),
  }
  let payout_output = fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(1_000_000),
    fixtures.stt_input_ref(),
    1,
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(86_400_000, 86_400_000),
    [],
    input_state,
    output_state,
    [payout_output],
    #"7d10000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.PayStreamingPayment(
        assets.from_lovelace(2_000_000) |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// sh.pay.real_progress — a crank that advances the cooldown stamp but makes NO
// streaming-payment progress (identical streaming set, empty delta) must be
// rejected, else any party could churn the STT thread at fee cost.
test pay_streaming_rejects_no_streaming_progress() fail {
  let input_state = crank_input_state()
  let output_state = state_types.State {
    ..input_state,
    last_permissionless_payout_at: Some(86_400_000),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(86_400_000, 86_400_000),
    [],
    input_state,
    output_state,
    [],
    #"7d20000000000000000000000000000000000000000000000000000000000000",
  )
  expect
    stt.eval_spend(
      None,
      state_types.PayStreamingPayment([]),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// ru.pay.paidout_eq — wallet-rule level: the wallet's net paid-out value must
// equal the declared payout delta. Here the tagged outputs sum to the delta
// (1_000_000) and are all legal, but the wallet moved 2_000_000 out, so only the
// paid-out equality check rejects.
test streaming_payout_rule_rejects_paidout_above_delta() fail {
  let wallet_values = wallet_rules.WalletValueSnapshot {
    input_value: assets.from_lovelace(5_000_000),
    output_value: assets.from_lovelace(3_000_000),
    paid_out_value: assets.from_lovelace(2_000_000),
  }
  expect
    helpers.allows_spend(
      state_types.PayStreamingPayment(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
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

// ---------------------------------------------------------------------------
// Mint.
// ---------------------------------------------------------------------------

// mint.last_payout_none — a freshly minted wallet may not seed the cooldown clock;
// `last_permissionless_payout_at` must be None at mint (a far-future seed would
// freeze early permissionless cranks). Otherwise-valid mint with a seeded stamp.
test mint_rejects_seeded_cooldown_stamp() fail {
  let input_ref = fixtures.stt_input_ref()
  let asset_name = io.output_reference_to_asset_name(input_ref)
  let state = state_types.State {
    ..admin_state(),
    last_permissionless_payout_at: Some(100),
  }
  let stt_output = fixtures.stt_output(
    fixtures.default_policy_id(),
    state,
    fixtures.stt_value(fixtures.default_policy_id(), asset_name, 2_000_000),
  )
  let transaction = mint_transaction(
    assets.from_asset(fixtures.default_policy_id(), asset_name, 1),
    [stt_output],
    input_ref,
    #"7e10000000000000000000000000000000000000000000000000000000000000",
  )
  expect stt.eval_mint(0, fixtures.default_policy_id(), transaction)
}
