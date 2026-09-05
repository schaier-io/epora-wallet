//// Tests for the `PayStreamingPayment` crank cadence (the whitepaper's
//// Settlement-cadence theorem): a NON-ADMIN crank must land at least
//// `non_admin_payout_cooldown_ms` (30 min) after the previous non-admin
//// crank, advances `last_non_admin_payout_at` to the tx UPPER bound, and its
//// validity window is capped at `max_payout_validity_window_ms` (1 h) so the stamp
//// can't jump far ahead. ONLY an ADMIN co-signature bypasses the cadence limit and
//// leaves the clock unchanged.
////
//// The crank is NOT permissionless: it must be signed by an admin, a multisig
//// quorum, a listed user, a stream PAYEE, or an unlocked beneficiary. The tests
//// below drive the non-admin branch through the PAYEE arm (`payee` == the
//// canonical stream's `payout_address` key), which isolates the cadence checks
//// from the authority gate.
////
//// The canonical streaming payment pays 1_000_000/day from start 0 to end
//// 259_200_000; at `tx_earliest = 86_400_000` (1 day) exactly 1_000_000 has
//// accrued, so a 0 -> 1_000_000 retained payout is valid and isolates the cooldown
//// checks.

use aiken/fuzz
use aiken/interval
use assets/entries as asset_entries
use cardano/assets
use cardano/transaction.{Transaction, ValidityRange}
use constants
use state/types as state_types
use stt
use test_support/security_fixtures as fixtures
use test_support/state_builders as states

const day_ms: Int = 86_400_000

// The canonical stream's payee key — the non-admin cranker used throughout.
const payee: ByteArray = "beneficiary1"

// Binds the constant `eval_spend` legs (unused datum, fixture input ref) —
// partial application, not a §4 pure forwarder; only action + tx vary per test.
fn run_stt_spend(action: state_types.SttAction, tx: Transaction) -> Bool {
  stt.eval_spend(None, action, fixtures.stt_input_ref(), tx)
}

// Build a `PayStreamingPayment` crank tx that pays the canonical stream
// 1_000_000, with chosen input/output cadence stamps, validity window and
// signers. The signer set is a parameter, so the same helper drives the admin
// (exempt) and non-admin (rate-limited) branches.
fn cooldown_payout_tx(
  input_last: Option<Int>,
  output_last: Option<Int>,
  validity: ValidityRange,
  signers: List<ByteArray>,
  id: ByteArray,
) -> Transaction {
  let input_state = state_types.State {
    ..states.streaming_payment_payout_state(0),
    last_non_admin_payout_at: input_last,
  }
  let output_state = state_types.State {
    ..states.streaming_payment_payout_state(1_000_000),
    last_non_admin_payout_at: output_last,
  }
  fixtures.stt_spend_tx(
    validity,
    signers,
    input_state,
    output_state,
    [
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    id,
  )
}

fn run_crank(tx: Transaction) -> Bool {
  run_stt_spend(
    state_types.PayStreamingPayment(
      assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
    ),
    tx,
  )
}

// A non-admin (here: payee-signed) crank whose lower bound has NOT yet reached
// `last + cooldown` is rejected. Here last = 86_000_000 and tx_earliest =
// 86_400_000 < 86_000_000 + 1_800_000, with no admin signature.
test cooldown_rejects_non_admin_crank_within_window() fail {
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [payee],
    fixtures.tx_id(#"6130"),
  )
  expect run_crank(transaction)
}

// The shared stamp has no source tag: when it was written by a receiver
// cancellation, it blocks the next non-admin payout just as a payout-written
// stamp does. This pins the cancel -> payout half of the cross-action cadence.
test cooldown_rejects_non_admin_crank_after_recent_receiver_cancel() fail {
  let recent_cancel_upper = 86_000_000
  let transaction = cooldown_payout_tx(
    Some(recent_cancel_upper),
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [payee],
    fixtures.tx_id(#"7f30"),
  )
  expect run_crank(transaction)
}

// Once the lower bound is at least `last + cooldown` past the previous stamp, a
// non-admin crank is accepted and re-stamps to the tx upper bound.
test cooldown_accepts_non_admin_crank_after_window() {
  let transaction = cooldown_payout_tx(
    Some(0),
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [payee],
    fixtures.tx_id(#"6230"),
  )
  expect run_crank(transaction)
}

// A fresh wallet (`last_non_admin_payout_at == None`) has no cooldown on its
// first non-admin crank.
test cooldown_accepts_first_crank_when_unset() {
  let transaction = cooldown_payout_tx(
    None,
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [payee],
    fixtures.tx_id(#"6330"),
  )
  expect run_crank(transaction)
}

// An admin co-signature bypasses the cooldown AND leaves the clock unchanged: the
// same within-window crank that `cooldown_rejects_non_admin_crank_within_window`
// rejects is accepted when the admin (`admin_user("admin")`) signs, provided the
// output PRESERVES the input stamp (here `Some(86_000_000)`).
test cooldown_admin_signature_bypasses_window() {
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(86_000_000),
    interval.between(day_ms, day_ms),
    ["admin"],
    fixtures.tx_id(#"6430"),
  )
  expect run_crank(transaction)
}

// Build the same within-cooldown crank (last stamp 86_000_000, window
// day_ms..day_ms) over a state that also carries one recovery beneficiary
// ("recovery1", weight 1, chosen `unlock_after`), paying the canonical stream
// 0 -> 1_000_000. Isolates the beneficiary-bypass branch of the cooldown gate.
fn beneficiary_cooldown_payout_tx(
  unlock_after: Option<Int>,
  signers: List<ByteArray>,
  id: ByteArray,
) -> Transaction {
  let recovery_beneficiary = state_types.Beneficiary {
    ..states.base_beneficiary(),
    id: 7,
    beneficiary_wallets: ["recovery1"],
    unlock_after,
  }
  let input_state = state_types.State {
    ..states.streaming_payment_payout_state(0),
    access: state_types.AccessControl {
      users: [states.admin_user("admin")],
      multi_sig_threshold: None,
      beneficiaries: [recovery_beneficiary],
    },
    last_non_admin_payout_at: Some(86_000_000),
  }
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: states.streaming_payment_payout_state(1_000_000).streaming_payments,
  }
  fixtures.stt_spend_tx(
    interval.between(day_ms, day_ms),
    signers,
    input_state,
    output_state,
    [
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key("beneficiary1"),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    id,
  )
}

// An unlocked beneficiary is an AUTHORIZED cranker but NOT an exempt one: only
// admin bypasses the cadence limit. PoL unlock_time 100 has long lapsed by
// tx_earliest = day_ms and `unlock_after` is unset, so "recovery1" holds unlock
// authority and clears the authority gate — but the tx sits inside the cooldown
// window (last = 86_000_000, tx_earliest = 86_400_000 < last + 1_800_000) and
// preserves the stamp instead of advancing it, so it is REJECTED.
//
// A payout may advance at most two schedules by positive amounts. A full pass
// over 15 positive schedules can therefore need 8 transactions. A recovering
// beneficiary must observe the cooldown between those transactions. Only an
// admin payout bypasses it. See `settlement_handlers.crank_authority_and_cooldown_ok`.
test cooldown_unlocked_beneficiary_does_not_bypass_window() fail {
  let transaction = beneficiary_cooldown_payout_tx(
    None,
    ["recovery1"],
    fixtures.tx_id(#"6930"),
  )
  expect run_crank(transaction)
}

// A still-LOCKED beneficiary's signature is not an authorized bypass: with
// `unlock_after` ten days out (effective unlock = max(10 days, 100) >
// tx_earliest = 1 day), the same within-cooldown crank stays rejected.
test cooldown_locked_beneficiary_signature_does_not_bypass() fail {
  let transaction = beneficiary_cooldown_payout_tx(
    Some(10 * day_ms),
    ["recovery1"],
    fixtures.tx_id(#"6a30"),
  )
  expect run_crank(transaction)
}

// An ADMIN crank bypasses the cooldown but may NOT advance the clock: an
// admin-signed crank whose output moves `last_non_admin_payout_at` forward
// (here Some(86_000_000) -> Some(day_ms)) is rejected. Pins that only the
// non-admin path stamps the field, so an admin cannot re-arm — or, via a
// far-future value, freeze — the non-admin cadence limit.
test cooldown_rejects_admin_crank_advancing_stamp() fail {
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(day_ms),
    interval.between(day_ms, day_ms),
    ["admin"],
    fixtures.tx_id(#"6f30"),
  )
  expect run_crank(transaction)
}

// The validity-window cap applies only to the non-admin (stamping) branch. An
// admin-signed crank that preserves the clock may use a window WIDER than
// `max_payout_validity_window_ms` (here 3_600_001 ms), since it never stamps from
// the upper bound. Complements `cooldown_rejects_validity_window_wider_than_max`,
// which rejects the same wide window on the non-admin path.
test cooldown_admin_crank_allows_window_wider_than_max() {
  let tx_latest = day_ms + 3_600_001
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(86_000_000),
    interval.between(day_ms, tx_latest),
    ["admin"],
    fixtures.tx_id(#"7030"),
  )
  expect run_crank(transaction)
}

// A validity window wider than `max_payout_validity_window_ms` (1 h) is rejected,
// so the upper-bound stamp can never sit far in the future. Window here is
// 3_600_001 ms.
test cooldown_rejects_validity_window_wider_than_max() fail {
  let tx_latest = day_ms + 3_600_001
  let transaction = cooldown_payout_tx(
    None,
    Some(tx_latest),
    interval.between(day_ms, tx_latest),
    [payee],
    fixtures.tx_id(#"6530"),
  )
  expect run_crank(transaction)
}

// The crank MUST stamp `last_non_admin_payout_at` with the tx upper bound;
// leaving it unchanged (here `None`) is rejected — otherwise the cooldown clock
// would never advance.
test cooldown_rejects_crank_without_stamp() fail {
  let transaction = cooldown_payout_tx(
    None,
    None,
    interval.between(day_ms, day_ms),
    [payee],
    fixtures.tx_id(#"6630"),
  )
  expect run_crank(transaction)
}

// Exact boundary, reject side: a lower bound ONE ms short of `last + cooldown`
// is still within the window. Complements the property below, which sweeps the
// accept side from the boundary upward.
test cooldown_rejects_gap_one_ms_short_of_cooldown() fail {
  let last = day_ms
  let tx_earliest = last + constants.non_admin_payout_cooldown_ms - 1
  let transaction = cooldown_payout_tx(
    Some(last),
    Some(tx_earliest),
    interval.between(tx_earliest, tx_earliest),
    [payee],
    fixtures.tx_id(#"6b30"),
  )
  expect run_crank(transaction)
}

// Exact boundary, accept side: a validity window of exactly
// `max_payout_validity_window_ms` passes the width cap.
test cooldown_accepts_window_exactly_at_max() {
  let tx_latest = day_ms + constants.max_payout_validity_window_ms
  let transaction = cooldown_payout_tx(
    None,
    Some(tx_latest),
    interval.between(day_ms, tx_latest),
    [payee],
    fixtures.tx_id(#"6c30"),
  )
  expect run_crank(transaction)
}

// Accept side of the cooldown gate, swept: for ANY prior stamp and ANY extra
// delay, a non-admin crank whose lower bound is at least `last + cooldown`
// validates (and re-stamps to its upper bound). Together with the
// one-ms-short reject above this pins the `>=` boundary exactly.
test prop_cooldown_accepts_any_gap_at_least_cooldown(
  args via fuzz.both(
    fuzz.int_between(0, 864_000_000),
    fuzz.int_between(0, 864_000_000),
  ),
) {
  let (last_offset, extra) = args
  let last = day_ms + last_offset
  let tx_earliest = last + constants.non_admin_payout_cooldown_ms + extra
  let transaction = cooldown_payout_tx(
    Some(last),
    Some(tx_earliest),
    interval.between(tx_earliest, tx_earliest),
    [payee],
    fixtures.tx_id(#"6d30"),
  )
  run_crank(transaction)
}

// Accept side of the window cap, swept: ANY width from 0 up to
// `max_payout_validity_window_ms` is allowed, and the stamp always lands on the
// tx UPPER bound. Together with the width-cap reject above (max + 1) this pins
// the `<=` boundary exactly.
test prop_cooldown_accepts_any_window_up_to_max(
  args via fuzz.int_between(0, 3_600_000),
) {
  let width = args
  let tx_latest = day_ms + width
  let transaction = cooldown_payout_tx(
    None,
    Some(tx_latest),
    interval.between(day_ms, tx_latest),
    [payee],
    fixtures.tx_id(#"6e30"),
  )
  run_crank(transaction)
}

// A NON-crank action may not move the cooldown stamp: an operator `Use` that
// changes `last_non_admin_payout_at` is rejected by the central preservation
// check in `eval_spend`, so no other transition can reset the clock.
test cooldown_rejects_non_crank_action_changing_stamp() fail {
  let input_state = state_types.State {
    ..states.secured_state([states.admin_user("admin")], [], []),
    last_non_admin_payout_at: Some(100),
  }
  let output_state = state_types.State {
    ..input_state,
    last_non_admin_payout_at: Some(200),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"6730"),
  )
  expect
    run_stt_spend(fixtures.operator_use_action(state_types.Admin), transaction)
}

// Sanity: a NON-crank action that PRESERVES a set stamp is accepted (the central
// check is preservation, not "must be None"). Operator `Use` renews proof-of-life
// while keeping `last_non_admin_payout_at` at `Some(100)`.
test cooldown_non_crank_action_preserving_stamp_accepted() {
  let input_state = state_types.State {
    ..states.secured_state([states.admin_user("admin")], [], []),
    last_non_admin_payout_at: Some(100),
  }
  let output_state = states.with_renewed_proof_of_life(input_state, 120)
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    fixtures.tx_id(#"6830"),
  )
  expect
    run_stt_spend(fixtures.operator_use_action(state_types.Admin), transaction)
}

// ---------------------------------------------------------------------------
// Authority gate (security review 2026-07). The crank used to be PERMISSIONLESS.
// Its anti-churn defence was a "real progress" diff on the streaming-payment set,
// which never bounded anything — one lovelace of progress satisfied it — so any
// party could re-occupy the single STT thread every block and stall the owner,
// including a proof-of-life renewal whose lapse arms the dead-man-switch. The
// diff is gone; these pin who may now crank.
// ---------------------------------------------------------------------------

// A crank signed by NOBODY is rejected outright, however well-formed the payout.
// This is the transaction-level complement to
// `stt_fuzz_tests.prop_stt_payout_rejects_unauthorized_cranker`.
test crank_rejects_unsigned_transaction() fail {
  let transaction = cooldown_payout_tx(
    None,
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [],
    fixtures.tx_id(#"7130"),
  )
  expect run_crank(transaction)
}

// A signature from a key that belongs to nobody in this wallet — not a user, not
// a payee, not a beneficiary — is equally rejected.
test crank_rejects_stranger_signature() fail {
  let transaction = cooldown_payout_tx(
    None,
    Some(day_ms),
    interval.between(day_ms, day_ms),
    ["stranger"],
    fixtures.tx_id(#"7230"),
  )
  expect run_crank(transaction)
}

// The PAYEE arm ("receivers"): the stream's own payout key may crank. This is
// what keeps settlement reachable when every wallet key is lost — the party owed
// the money can always pull it. Subject to the cadence limit like any non-admin.
test crank_accepts_stream_payee_signature() {
  let transaction = cooldown_payout_tx(
    None,
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [payee],
    fixtures.tx_id(#"7330"),
  )
  expect run_crank(transaction)
}

// The USER arm: any listed user may crank, whatever their role. Here
// `plain_user` — no admin flag, no multisig power, no allowance, no renewal
// right, i.e. the weakest "belongs to this wallet" authority there is — is
// enough on its own.
test crank_accepts_plain_user_signature() {
  let input_state = state_types.State {
    ..states.streaming_payment_payout_state(0),
    access: state_types.AccessControl {
      users: [states.admin_user("admin"), states.plain_user(2, "plainuser")],
      multi_sig_threshold: None,
      beneficiaries: [],
    },
    last_non_admin_payout_at: None,
  }
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: states.streaming_payment_payout_state(1_000_000).streaming_payments,
    last_non_admin_payout_at: Some(day_ms),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(day_ms, day_ms),
    ["plainuser"],
    input_state,
    output_state,
    [
      fixtures.tagged_streaming_payment_output(
        fixtures.address_from_key(payee),
        assets.from_lovelace(1_000_000),
        fixtures.stt_input_ref(),
        1,
      ),
    ],
    fixtures.tx_id(#"7430"),
  )
  expect run_crank(transaction)
}
