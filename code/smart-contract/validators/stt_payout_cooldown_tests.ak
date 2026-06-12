//// Tests for the permissionless `PayStreamingPayment` crank cooldown (the
//// whitepaper's Settlement-cadence theorem):
//// a PERMISSIONLESS crank must land at least `permissionless_payout_cooldown_ms`
//// (30 min) after the previous permissionless crank, advances
//// `last_permissionless_payout_at` to the tx UPPER bound, and its validity window
//// is capped at `max_payout_validity_window_ms` (1 h) so the stamp can't jump far
//// ahead. Any AUTHORIZED co-signature — admin, multisig quorum, or an UNLOCKED
//// beneficiary (recovery) — bypasses the cooldown AND leaves the clock unchanged
//// (it is not the throttled path); the field tracks only the unauthenticated path.
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

const day_ms: Int = 86_400_000

// Build a permissionless `PayStreamingPayment` crank tx that pays the canonical
// stream 1_000_000, with chosen input/output cooldown stamps, validity window and
// signers.
fn cooldown_payout_tx(
  input_last: Option<Int>,
  output_last: Option<Int>,
  validity: ValidityRange,
  signers: List<ByteArray>,
  id: ByteArray,
) -> Transaction {
  let input_state = state_types.State {
    ..fixtures.streaming_payment_payout_state(0),
    last_permissionless_payout_at: input_last,
  }
  let output_state = state_types.State {
    ..fixtures.streaming_payment_payout_state(1_000_000),
    last_permissionless_payout_at: output_last,
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
  stt.eval_spend(
    None,
    state_types.PayStreamingPayment(
      assets.from_lovelace(1_000_000) |> asset_entries.flatten_to_entries,
    ),
    fixtures.stt_input_ref(),
    tx,
  )
}

// A permissionless crank whose lower bound has NOT yet reached
// `last + cooldown` is rejected. Here last = 86_000_000 and tx_earliest =
// 86_400_000 < 86_000_000 + 1_800_000, with no admin signature.
test cooldown_rejects_permissionless_crank_within_window() fail {
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [],
    #"6130000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// Once the lower bound is at least `last + cooldown` past the previous stamp, a
// permissionless crank is accepted and re-stamps to the tx upper bound.
test cooldown_accepts_permissionless_crank_after_window() {
  let transaction = cooldown_payout_tx(
    Some(0),
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [],
    #"6230000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// A fresh wallet (`last_permissionless_payout_at == None`) has no cooldown on its
// first permissionless crank.
test cooldown_accepts_first_crank_when_unset() {
  let transaction = cooldown_payout_tx(
    None,
    Some(day_ms),
    interval.between(day_ms, day_ms),
    [],
    #"6330000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// An admin co-signature bypasses the cooldown AND leaves the clock unchanged: the
// same within-window crank that `cooldown_rejects_permissionless_crank_within_window`
// rejects is accepted when the admin (`admin_user("admin")`) signs, provided the
// output PRESERVES the input stamp (here `Some(86_000_000)`).
test cooldown_admin_signature_bypasses_window() {
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(86_000_000),
    interval.between(day_ms, day_ms),
    ["admin"],
    #"6430000000000000000000000000000000000000000000000000000000000000",
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
  let recovery_beneficiary = fixtures.beneficiary(
    7,
    ["recovery1"],
    unlock_after,
    1,
  )
  let input_state = state_types.State {
    ..fixtures.streaming_payment_payout_state(0),
    access: state_types.AccessControl {
      users: [fixtures.admin_user("admin")],
      multi_sig_threshold: None,
      beneficiaries: [recovery_beneficiary],
    },
    last_permissionless_payout_at: Some(86_000_000),
  }
  let output_state = state_types.State {
    ..input_state,
    streaming_payments: fixtures.streaming_payment_payout_state(1_000_000).streaming_payments,
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

// The cooldown throttles only the UNAUTHENTICATED path: an unlocked, signed
// beneficiary (the recovery actor) bypasses it just like admin/multisig and leaves
// the clock unchanged, so the recovery settle-every-stream crank sequence is never
// rate-limited. PoL unlock_time 100 has long lapsed by tx_earliest = day_ms, and
// `unlock_after` is unset, so "recovery1" holds unlock authority.
test cooldown_unlocked_beneficiary_signature_bypasses_window() {
  let transaction = beneficiary_cooldown_payout_tx(
    None,
    ["recovery1"],
    #"6930000000000000000000000000000000000000000000000000000000000000",
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
    #"6a30000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// An AUTHORIZED crank bypasses the cooldown but may NOT advance the clock: an
// admin-signed crank whose output moves `last_permissionless_payout_at` forward
// (here Some(86_000_000) -> Some(day_ms)) is rejected. Pins that only the
// permissionless path stamps the field, so an authorized actor cannot re-arm — or,
// via a far-future value, freeze — the permissionless cooldown.
test cooldown_rejects_authorized_crank_advancing_stamp() fail {
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(day_ms),
    interval.between(day_ms, day_ms),
    ["admin"],
    #"6f30000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// The validity-window cap applies only to the permissionless (stamping) branch. An
// admin-signed crank that preserves the clock may use a window WIDER than
// `max_payout_validity_window_ms` (here 3_600_001 ms), since it never stamps from
// the upper bound. Complements `cooldown_rejects_validity_window_wider_than_max`,
// which rejects the same wide window on the permissionless path.
test cooldown_authorized_crank_allows_window_wider_than_max() {
  let tx_latest = day_ms + 3_600_001
  let transaction = cooldown_payout_tx(
    Some(86_000_000),
    Some(86_000_000),
    interval.between(day_ms, tx_latest),
    ["admin"],
    #"7030000000000000000000000000000000000000000000000000000000000000",
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
    [],
    #"6530000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// The crank MUST stamp `last_permissionless_payout_at` with the tx upper bound;
// leaving it unchanged (here `None`) is rejected — otherwise the cooldown clock
// would never advance.
test cooldown_rejects_crank_without_stamp() fail {
  let transaction = cooldown_payout_tx(
    None,
    None,
    interval.between(day_ms, day_ms),
    [],
    #"6630000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// Exact boundary, reject side: a lower bound ONE ms short of `last + cooldown`
// is still within the window. Complements the property below, which sweeps the
// accept side from the boundary upward.
test cooldown_rejects_gap_one_ms_short_of_cooldown() fail {
  let last = day_ms
  let tx_earliest = last + constants.permissionless_payout_cooldown_ms - 1
  let transaction = cooldown_payout_tx(
    Some(last),
    Some(tx_earliest),
    interval.between(tx_earliest, tx_earliest),
    [],
    #"6b30000000000000000000000000000000000000000000000000000000000000",
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
    [],
    #"6c30000000000000000000000000000000000000000000000000000000000000",
  )
  expect run_crank(transaction)
}

// Accept side of the cooldown gate, swept: for ANY prior stamp and ANY extra
// delay, a permissionless crank whose lower bound is at least `last + cooldown`
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
  let tx_earliest = last + constants.permissionless_payout_cooldown_ms + extra
  let transaction = cooldown_payout_tx(
    Some(last),
    Some(tx_earliest),
    interval.between(tx_earliest, tx_earliest),
    [],
    #"6d30000000000000000000000000000000000000000000000000000000000000",
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
    [],
    #"6e30000000000000000000000000000000000000000000000000000000000000",
  )
  run_crank(transaction)
}

// A NON-crank action may not move the cooldown stamp: an operator `Use` that
// changes `last_permissionless_payout_at` is rejected by the central preservation
// check in `eval_spend`, so no other transition can reset the clock.
test cooldown_rejects_non_crank_action_changing_stamp() fail {
  let input_state = state_types.State {
    ..fixtures.secured_state([fixtures.admin_user("admin")], [], []),
    last_permissionless_payout_at: Some(100),
  }
  let output_state = state_types.State {
    ..input_state,
    last_permissionless_payout_at: Some(200),
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"6730000000000000000000000000000000000000000000000000000000000000",
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

// Sanity: a NON-crank action that PRESERVES a set stamp is accepted (the central
// check is preservation, not "must be None"). Operator `Use` renews proof-of-life
// while keeping `last_permissionless_payout_at` at `Some(100)`.
test cooldown_non_crank_action_preserving_stamp_accepted() {
  let input_state = state_types.State {
    ..fixtures.secured_state([fixtures.admin_user("admin")], [], []),
    last_permissionless_payout_at: Some(100),
  }
  let output_state = state_types.State {
    ..input_state,
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(120),
      increment: Some(50),
    },
  }
  let transaction = fixtures.stt_spend_tx(
    interval.between(110, 120),
    ["admin"],
    input_state,
    output_state,
    [],
    #"6830000000000000000000000000000000000000000000000000000000000000",
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
