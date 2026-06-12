//// Security test catalog.
////
////  - `security_attack_log__attack_*` (`fail` tests below): each documents an
////    attack the validator MUST reject. The transaction is well-formed enough
////    that the validator must actively notice the constraint violation.
////  - `security_intentional__*` (passing tests at the bottom): document
////    behaviours that are intentional product choices, not security holes —
////    e.g. shared keys carrying weight in multiple multisig roles. See
////    README §"Role Model & Trust Boundaries" for the broader discussion.

use aiken/interval
use assets/entries as asset_entries
use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{Input, NoDatum, Output}
use state/authorization as state_authorization
use state/configuration as state_configuration
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use wallet

test security_attack_log__attack_manage_streaming_payments_cannot_extend_unlock_past_increment_window() fail {
  let input_streaming_payment = fixtures.streaming_payment(
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
    [input_streaming_payment],
  )
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(171),
      increment: Some(50),
    },
    wallet_name: #"",
    streaming_payments: [
      fixtures.streaming_payment(
        1,
        fixtures.address_from_key("beneficiary1"),
        0,
        #"",
        #"",
        1_000_000,
        0,
        345_600_000,
      ),
    ],
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"9230000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.ManageStreamingPayments,
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test security_attack_log__attack_renew_proof_of_life_cannot_set_unlock_before_tx_upper_bound() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(119),
      increment: Some(50),
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["user1"],
    input_state,
    output_state,
    [],
    #"9330000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RenewProofOfLife,
      fixtures.stt_input_ref(),
      transaction,
    )
}

test security_attack_log__attack_allowance_cannot_renew_proof_of_life_for_the_wrong_user() fail {
  let input_state = fixtures.secured_state(
    [
      fixtures.allowance_user(1, "spender", 1_000_000, 86_400_000, False),
      fixtures.allowance_user(2, "renewer", 1_000_000, 86_400_000, True),
    ],
    [],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    access: state_types.AccessControl {
      users: [
        fixtures.allowance_user(1, "spender", 0, 86_400_110, False),
        fixtures.allowance_user(2, "renewer", 1_000_000, 86_400_000, True),
      ],
      multi_sig_threshold: input_state.access.multi_sig_threshold,
      beneficiaries: input_state.access.beneficiaries,
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(120),
      increment: Some(50),
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["spender"],
    input_state,
    output_state,
    [],
    #"9430000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseAllowance(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test security_attack_log__attack_streaming_payment_payout_cannot_use_the_wrong_input_reference_tag() fail {
  let input_streaming_payment = fixtures.streaming_payment(
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
    [input_streaming_payment],
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
  }
  let payout_output = fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(1_000_000),
    fixtures.secondary_stt_input_ref(),
    1,
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(86_400_000, 86_400_000),
    [],
    input_state,
    output_state,
    [payout_output],
    #"9530000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.PayStreamingPayment(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test security_attack_log__attack_beneficiary_cannot_unlock_before_the_boundary_time() fail {
  let state = fixtures.secured_state(
    [fixtures.admin_user("admin")],
    [fixtures.default_beneficiary(7, "beneficiary1", Some(100))],
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(99, 120),
    ["beneficiary1"],
    state,
    state,
    [],
    #"9630000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(7),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test security_attack_log__attack_allowance_reset_cannot_anchor_to_stale_lower_bound() fail {
  let input_state = fixtures.state(
    [fixtures.allowance_user(1, "user1", 1_000_000, 0, False)],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let output_state = fixtures.state(
    [fixtures.allowance_user(1, "user1", 0, 86_400_100, False)],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(100, 200),
    ["user1"],
    input_state,
    output_state,
    [],
    #"9830000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseAllowance(
        assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

test security_attack_log__attack_streaming_payment_payout_cannot_tag_external_funded_output_while_wallet_pays_elsewhere() fail {
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
  let input_state = fixtures.state(
    [fixtures.user(0, ["admin"], [], [], 0, False, None, True)],
    None,
    [],
    Some(100),
    Some(50),
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
  }
  let payout_delta = assets.from_lovelace(1_000_000)
    |> asset_entries.flatten_to_entries
  let stt_input = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    input_state,
    fixtures.default_stt_value(),
  )
  let wallet_input = fixtures.wallet_input(
    fixtures.wallet_input_ref(),
    assets.from_lovelace(2_000_000),
  )
  let attacker_input = fixtures.external_input(
    fixtures.secondary_wallet_input_ref(),
    fixtures.address_from_key("attacker"),
    assets.from_lovelace(1_000_000),
  )
  let stt_output = fixtures.stt_output(
    fixtures.default_policy_id(),
    output_state,
    fixtures.default_stt_value(),
  )
  let wallet_output = fixtures.wallet_output(assets.from_lovelace(1_000_000))
  let attacker_output = fixtures.payout_output(
    fixtures.address_from_key("attacker"),
    assets.from_lovelace(1_000_000),
  )
  let tagged_beneficiary_output = fixtures.tagged_streaming_payment_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(1_000_000),
    fixtures.stt_input_ref(),
    1,
  )
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(86_400_000, 86_400_000),
    [],
    [wallet_input, stt_input, attacker_input],
    [wallet_output, attacker_output, tagged_beneficiary_output, stt_output],
    #"9930000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.streaming_payment_action(payout_delta),
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

// Covers M-1: a renewing user sets an arbitrarily wide validity range and picks an unlock_time
// equal to tx_latest_time. Under the old rule (upper_bound + increment as the ceiling) this
// silently bypassed the per-renewal `increment` cap. The fix anchors the ceiling to lower_bound
// + increment so a wide interval cannot be used to push unlock far into the future.
test security_attack_log__attack_renew_proof_of_life_cannot_extend_beyond_increment_via_wide_validity_range() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [],
    [],
  )
  let far_future = 1_000_000_000
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(far_future),
      increment: Some(50),
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, far_future),
    ["user1"],
    input_state,
    output_state,
    [],
    #"a030000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RenewProofOfLife,
      fixtures.stt_input_ref(),
      transaction,
    )
}

// Covers L-1: a beneficiary spends two wallet UTxOs that share the wallet script's payment
// credential but differ in stake credential, and drains more than its weighted share in total.
// Under the old rule each per-invocation snapshot filtered by exact Address, so K stake variants
// let the beneficiary take K x its share in one transaction. The fix aggregates the snapshot by
// payment credential, so the combined outflow is measured against a single weighted share. Here
// beneficiary 7 has weight 1 of a total weight of 10, so its share of the aggregated 10 ADA pool
// is 1 ADA; taking 2 ADA across the two stake variants must be rejected.
test security_attack_log__attack_beneficiary_cannot_drain_multiple_stake_variants_per_tx() fail {
  let wallet_script_hash = #"bb"
  let wallet_address_a = Address {
    payment_credential: Script(wallet_script_hash),
    stake_credential: Some(Inline(VerificationKey(#"aa"))),
  }
  let wallet_address_b = Address {
    payment_credential: Script(wallet_script_hash),
    stake_credential: Some(Inline(VerificationKey(#"ab"))),
  }
  let state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [
      fixtures.beneficiary(7, ["beneficiary1"], Some(100), 1),
      fixtures.beneficiary(8, ["beneficiary2"], Some(100), 9),
    ],
    Some(100),
    Some(50),
    [],
  )
  let stt_input = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
  let stt_output = fixtures.stt_output(
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
  let wallet_input_a = Input {
    output_reference: fixtures.wallet_input_ref(),
    output: Output {
      address: wallet_address_a,
      value: assets.from_lovelace(5_000_000),
      datum: NoDatum,
      reference_script: None,
    },
  }
  let wallet_input_b = Input {
    output_reference: fixtures.secondary_wallet_input_ref(),
    output: Output {
      address: wallet_address_b,
      value: assets.from_lovelace(5_000_000),
      datum: NoDatum,
      reference_script: None,
    },
  }
  let wallet_return_a = Output {
    address: wallet_address_a,
    value: assets.from_lovelace(4_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let wallet_return_b = Output {
    address: wallet_address_b,
    value: assets.from_lovelace(4_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let beneficiary_output = fixtures.payout_output(
    fixtures.address_from_key("beneficiary1"),
    assets.from_lovelace(2_000_000),
  )
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(120, 200),
    ["beneficiary1"],
    [stt_input, wallet_input_a, wallet_input_b],
    [stt_output, wallet_return_a, wallet_return_b, beneficiary_output],
    #"a130000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.beneficiary_action(7),
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

// Stake-credential / Franken-address defense (wallet side): a continuing wallet
// output re-homed under a foreign stake credential (same payment credential,
// attacker stake) must be rejected — even for a value-preserving Consolidate
// where input value == output value. Without the intended-stake check the
// movement would pass (the value preservation rule alone is satisfied).
test security_attack_log__attack_wallet_spend_cannot_rehome_output_stake_credential() fail {
  let state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let stt_input = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
  let stt_output = fixtures.stt_output(
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
  let wallet_input = fixtures.wallet_input(
    fixtures.wallet_input_ref(),
    assets.from_lovelace(5_000_000),
  )
  // Same wallet payment credential (#"bb"), but an attacker-controlled stake
  // credential — a Franken address that would hijack delegation/rewards and
  // hide the funds from address-based discovery.
  let rehomed_wallet_output = Output {
    address: Address {
      payment_credential: Script(#"bb"),
      stake_credential: Some(Inline(VerificationKey(#"a77ac6e7"))),
    },
    value: assets.from_lovelace(5_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(120, 200),
    ["admin"],
    [stt_input, wallet_input],
    [stt_output, rehomed_wallet_output],
    #"a430000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.consolidation_action(state_types.AdminPath),
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

// Attribution twin: the SAME value-preserving consolidation, but the continuing
// wallet output uses the intended stake credential (None, the fixture default),
// MUST succeed — proving the rejection above is due to the re-home, not the
// consolidation itself.
test security_intentional__wallet_spend_to_intended_stake_succeeds() {
  let state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let stt_input = fixtures.stt_input(
    fixtures.stt_input_ref(),
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
  let stt_output = fixtures.stt_output(
    fixtures.default_policy_id(),
    state,
    fixtures.default_stt_value(),
  )
  let wallet_input = fixtures.wallet_input(
    fixtures.wallet_input_ref(),
    assets.from_lovelace(5_000_000),
  )
  let wallet_output = fixtures.wallet_output(assets.from_lovelace(5_000_000))
  let transaction = fixtures.transaction_with_stt_redeemer(
    interval.between(120, 200),
    ["admin"],
    [stt_input, wallet_input],
    [stt_output, wallet_output],
    #"a530000000000000000000000000000000000000000000000000000000000000",
    fixtures.stt_input_ref(),
    fixtures.consolidation_action(state_types.AdminPath),
  )

  expect
    wallet.eval_spend(
      fixtures.default_policy_id(),
      fixtures.default_asset_name(),
      None,
      0,
      fixtures.wallet_input_ref(),
      transaction,
    )
}

// An admin may set the intended stake credential via the dedicated path.
test security_intentional__admin_can_set_intended_stake_credential() {
  let input_state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let new_stake = VerificationKey(#"57")
  let output_state = state_types.State {
    ..input_state,
    intended_stake_credential: Some(new_stake),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"a630000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.SetIntendedStakeCredential(Some(new_stake)),
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// SetIntendedStakeCredential without operator authority must be rejected (the
// only admin user does not sign).
test security_attack_log__attack_set_intended_stake_credential_requires_authority() fail {
  let input_state = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let new_stake = VerificationKey(#"57")
  let output_state = state_types.State {
    ..input_state,
    intended_stake_credential: Some(new_stake),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["not_admin"],
    input_state,
    output_state,
    [],
    #"a730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RunOperator(
        state_types.OperatorAction {
          path: state_types.Admin,
          kind: state_types.SetIntendedStakeCredential(Some(new_stake)),
        },
      ),
      fixtures.stt_input_ref(),
      transaction,
    )
}

// A non-Set action may NOT change intended_stake_credential. Here an otherwise
// valid proof-of-life renewal also flips the intended stake credential; the
// central preservation check in eval_spend must reject it.
test security_attack_log__attack_non_set_action_cannot_change_intended_stake_credential() fail {
  let input_state = fixtures.secured_state(
    [fixtures.renewing_user(1, "user1")],
    [],
    [],
  )
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(160),
      increment: Some(50),
    },
    intended_stake_credential: Some(VerificationKey(#"57")),
    last_permissionless_payout_at: None,
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["user1"],
    input_state,
    output_state,
    [],
    #"a830000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.RenewProofOfLife,
      fixtures.stt_input_ref(),
      transaction,
    )
}

// ---------------------------------------------------------------------------
// Confirmed-intentional behaviors (passing tests; documented product choices).
// ---------------------------------------------------------------------------

fn duplicate_multisig_state() -> state_types.State {
  fixtures.state(
    [
      fixtures.user(1, ["shared"], [], [], 0, False, Some(1), False),
      fixtures.user(2, ["shared"], [], [], 0, False, Some(1), False),
    ],
    Some(2),
    [],
    None,
    None,
    [],
  )
}

// A single signer who holds two multisig user records exercises the combined
// voting power of both records. This is intentional: shared keys that play
// multiple roles are expected to count for each role they hold.
test security_intentional__multisig_shared_key_counts_each_role_state_configuration() {
  expect
    state_configuration.expect_valid_state_configuration(
      duplicate_multisig_state(),
    )
}

test security_intentional__multisig_shared_key_counts_each_role_meets_threshold() {
  let transaction = fixtures.transaction(
    interval.after(0),
    ["shared"],
    [],
    [],
    #"9730000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    state_authorization.has_operator_authority(
      transaction,
      duplicate_multisig_state(),
      state_types.Multisig,
    )
}

// F-1 (audit): the permissionless streaming-payment crank must make REAL
// progress. A no-op `PayStreamingPayment` (identical streaming-payment set,
// empty delta) signed by NOBODY used to be accepted, letting any party churn the
// single STT thread to grief liveness — and potentially stall a proof-of-life
// renewal until the dead-man-switch lapsed. It is now REJECTED. (fail => REJECTED.)
test security_attack_log__attack_noop_pay_streaming_payment_is_rejected() fail {
  let s = fixtures.state(
    [fixtures.admin_user("admin")],
    None,
    [],
    Some(100),
    Some(50),
    [],
  )
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    [],
    s,
    s,
    [],
    #"a930000000000000000000000000000000000000000000000000000000000000",
  )

  stt.eval_spend(
    None,
    state_types.PayStreamingPayment([]),
    fixtures.stt_input_ref(),
    transaction,
  )
}

// F-2 (audit) — INTENTIONAL terminal state. In an admin-less, multisig-less,
// last-beneficiary wallet, `UseBeneficiary` removes the only remaining access
// path, so the OUTPUT state is intentionally unreachable: the immortal-STT
// terminal state after full recovery. It is ACCEPTED on-chain. The contract
// enforces only the UPPER weighted-share bound, not a minimum withdrawal, so the
// recovering beneficiary MUST sweep every asset in the same tx (the off-chain
// builder is responsible for this and for warning the user) — any value left
// behind is locked forever. Confirms brick-on-last-removal is by design.
test security_intentional__use_beneficiary_last_removal_reaches_terminal_state() {
  let ben = fixtures.beneficiary(10, ["ben1"], Some(100), 1)
  let input_state = fixtures.state([], None, [ben], Some(100), Some(50), [])
  let output_state = fixtures.state([], None, [], Some(100), Some(50), [])
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["ben1"],
    input_state,
    output_state,
    [],
    #"aa30000000000000000000000000000000000000000000000000000000000000",
  )

  expect
    stt.eval_spend(
      None,
      state_types.UseBeneficiary(10),
      fixtures.stt_input_ref(),
      transaction,
    )
}
