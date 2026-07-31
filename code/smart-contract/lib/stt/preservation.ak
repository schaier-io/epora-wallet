//// State-preservation predicates for the STT spend handlers.
////
//// Each STT action mutates a different subset of `State`. These helpers encode
//// the "which fields must stay equal" check once, so the per-action handlers in
//// the `lib/stt/{operator,user,settlement}_handlers.ak` modules (dispatched from
//// `validators/stt.ak::eval_spend`) stay declarative instead of carrying the
//// field-by-field plumbing.
////
//// Every helper routes its "unchanged field" checks through ONE enumeration of
//// the preservable `State` fields (`StateField` + `state_preserved_except`), so a
//// new field is added in a single place and is then preserved by DEFAULT across
//// every action (opt-OUT via a `mutable` list, never opt-in — a field a future
//// author forgets stays locked, it does not silently become mutable). This
//// mirrors `streaming_payments/types.core_fields_match` for the streaming-payment
//// record. `intended_stake_credential` and `last_non_admin_payout_at` are
//// deliberately NOT in the set: they are preserved CENTRALLY in
//// `validators/stt.ak::eval_spend` (every action but their one dedicated
//// mutator action(s)), so they never appear in a per-handler check here.
////
//// State mutation matrix — which fields each action allows to change:
////
////   action                                  | access | pol.unlock | pol.incr | streams | name | helper
////   ----------------------------------------+--------+------------+----------+---------+------+--------------------------------------------------
////   RunOperator(Use)                        |   -    |     y      |    -     |    -    |  -   | state_unchanged_except_pol_unlock_time
////   RunOperator(UpdateState)                |   y    |     y      |    y     |    -    |  y¹  | (inline; no preservation helper — arbitrary)
////   RunOperator(ManageStreamingPayments)    |   -    |     y      |    -     |    y    |  -   | state_unchanged_except_pol_unlock_time_and_streaming_payments
////   RunOperator(RemoveAccessIndex)          |   y⁴   |     -      |    -     |    -    |  -   | state_unchanged_except_access_index_removed
////   RunOperator(SetIntendedStakeCredential) |   -    |     -      |    -     |    -    |  -   | state_completely_unchanged ⁵
////   RenewProofOfLife                        |   -    |     y      |    -     |    -    |  -   | state_unchanged_except_pol_unlock_time
////   UseAllowance(_)                         |   y²   |     y      |    -     |    -    |  -   | state_unchanged_except_users_and_pol_unlock_time
////   UseBeneficiary(_)                       |   y³   |     -      |    -     |    -    |  -   | state_unchanged_except_beneficiary_removed
////   PayStreamingPayment(_)                  |   -    |     -      |    -     |    y    |  -   | state_unchanged_except_streaming_payments
////   Consolidate(_)                          |   -    |     -      |    -     |    -    |  -   | state_completely_unchanged
////   CancelStreamingPayment(_)               |   -    |     -      |    -     |    y⁶   |  -   | state_unchanged_except_streaming_payments ⁷
////
////   y  = field may change
////   -  = field must equal input
////   y¹ = only admin path may change wallet_name
////   y² = only the changed user's mutable allowance fields; static user fields
////        and the access-level multi_sig_threshold / beneficiaries are preserved
////   y³ = only the acting beneficiary is removed from access.beneficiaries;
////        users and multi_sig_threshold are preserved
////   y⁴ = exactly one entry (user or beneficiary, by index) is removed from the
////        targeted access list; the other access sub-fields are preserved
////   ⁵  = the new credential value itself is not a matrix column — it is guarded
////        centrally in `validators/stt.ak::eval_spend` (see the field-set note
////        above), so "everything else preserved" IS the complete check and the
////        action shares `state_completely_unchanged` with Consolidate; the
////        handler pins the new credential against the redeemer target itself
////   y⁶ = only the target payee-owned payment's `end_date` may move — enforced
////        by `is_payee_cancelled` in
////        `settlement_handlers.ak`, not by the preservation helper (which only
////        frees the `streaming_payments` field)
////   ⁷  = Cancel also advances `last_non_admin_payout_at`; that field is outside
////        this matrix and is pinned by the shared cadence helper

use aiken/collection/list
use aiken/fuzz
use state/types as state_types

/// The set of `State` fields some action is allowed to mutate, so a preservation
/// check reads as "everything equal EXCEPT these". THE single enumeration of the
/// preservable field set: adding a `State` field means adding one variant here
/// plus one arm in `state_preserved_except`, after which every helper below
/// preserves it by default. `access` is split into its three sub-fields (actions
/// mutate different parts of it) and `proof_of_life` into its two. Excludes
/// `intended_stake_credential` and `last_non_admin_payout_at` — those are
/// guarded centrally in `validators/stt.ak::eval_spend`, not per-handler.
type StateField {
  AccessUsers
  AccessMultisigThreshold
  AccessBeneficiaries
  PolUnlockTime
  PolIncrement
  StreamingPayments
  WalletName
}

/// True when every preservable `State` field is equal between `input` and
/// `output`, except those listed in `mutable`. The one place the field set is
/// enumerated; `||` short-circuits the equality check for a mutable field.
fn state_preserved_except(
  input: state_types.State,
  output: state_types.State,
  mutable: List<StateField>,
) -> Bool {
  and {
    (list.has(mutable, AccessUsers) || input.access.users == output.access.users)?,
    (list.has(mutable, AccessMultisigThreshold) || input.access.multi_sig_threshold == output.access.multi_sig_threshold)?,
    (list.has(mutable, AccessBeneficiaries) || input.access.beneficiaries == output.access.beneficiaries)?,
    (list.has(mutable, PolUnlockTime) || input.proof_of_life.unlock_time == output.proof_of_life.unlock_time)?,
    (list.has(mutable, PolIncrement) || input.proof_of_life.increment == output.proof_of_life.increment)?,
    (list.has(mutable, StreamingPayments) || input.streaming_payments == output.streaming_payments)?,
    (list.has(mutable, WalletName) || input.wallet_name == output.wallet_name)?,
  }
}

/// Every field except proof-of-life `unlock_time` must be equal.
/// Used by: operator Use, proof-of-life renewal.
pub fn state_unchanged_except_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [PolUnlockTime])
}

/// Access + proof-of-life increment + wallet_name preserved; streaming_payments and
/// proof-of-life unlock_time may change.
/// Used by: ManageStreamingPayments.
pub fn state_unchanged_except_pol_unlock_time_and_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [PolUnlockTime, StreamingPayments])
}

/// Multisig threshold + beneficiaries + proof-of-life increment + streaming_payments
/// + wallet_name preserved; users and proof-of-life unlock_time may change.
/// Used by: UseAllowance (and the proof-of-life update inside it).
pub fn state_unchanged_except_users_and_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [AccessUsers, PolUnlockTime])
}

/// Everything preserved. Note this spans only the preservable field set:
/// `intended_stake_credential` is not a `StateField` (guarded centrally in
/// `eval_spend`), which is why SetIntendedStakeCredential — whose one mutation
/// is exempted there — can share this predicate and assert the new credential
/// value separately (see matrix footnote ⁵).
/// Used by: Consolidate, SetIntendedStakeCredential.
pub fn state_completely_unchanged(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [])
}

/// Everything preserved except that exactly the acting beneficiary (matched by
/// its unique id) is removed from the beneficiary list. Beneficiary ids are
/// guaranteed unique by `expect_valid_state_configuration`, so filtering by
/// `id != removed` drops exactly one entry.
/// Used by: UseBeneficiary.
pub fn state_unchanged_except_beneficiary_removed(
  input: state_types.State,
  output: state_types.State,
  removed_beneficiary_id: Int,
) -> Bool {
  let expected_beneficiaries = list.filter(
    input.access.beneficiaries,
    fn(beneficiary) { beneficiary.id != removed_beneficiary_id },
  )
  and {
    state_preserved_except(input, output, [AccessBeneficiaries])?,
    (output.access.beneficiaries == expected_beneficiaries)?,
  }
}

/// Access + proof-of-life + wallet_name preserved; only streaming_payments may
/// change.
/// Used by: PayStreamingPayment and CancelStreamingPayment. Their cadence-clock
/// handling is enforced separately because that field sits outside this matrix.
pub fn state_unchanged_except_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [StreamingPayments])
}

/// Output equals the input with exactly the entry at `index` removed from the
/// targeted access list, and every other field preserved. The
/// `length == input - 1` guard rejects an out-of-range index (`remove_at` is then
/// a no-op, leaving the length unchanged).
/// Used by: RemoveAccessIndex.
pub fn state_unchanged_except_access_index_removed(
  input: state_types.State,
  output: state_types.State,
  target: state_types.AccessIndexTarget,
) -> Bool {
  when target is {
    state_types.UserIndex(index) -> and {
        state_preserved_except(input, output, [AccessUsers])?,
        (output.access.users == remove_at(input.access.users, index))?,
        (list.length(output.access.users) == list.length(input.access.users) - 1)?,
      }
    state_types.BeneficiaryIndex(index) -> and {
        state_preserved_except(input, output, [AccessBeneficiaries])?,
        (output.access.beneficiaries == remove_at(
          input.access.beneficiaries,
          index,
        ))?,
        (list.length(output.access.beneficiaries) == list.length(
          input.access.beneficiaries,
        ) - 1)?,
      }
  }
}

/// Drop the element at `index` (0-based). An out-of-range or negative `index`
/// returns the list unchanged, so callers MUST assert the length decreased.
fn remove_at(items: List<a>, index: Int) -> List<a> {
  list.concat(list.take(items, index), list.drop(items, index + 1))
}

// ===========================================================================
// Property-based coverage for the private `remove_at` clamp (the sanctioned
// test co-location noted in the contracts CLAUDE.md §2 — the helper cannot be
// exercised from the `_tests.ak` sibling without going `pub`, which would
// widen the audited API surface with a generic list utility). The out-of-range
// no-op is the boundary the `length == input - 1` guards above lean on; those
// guards stay pinned through the pub API in `preservation_tests.ak`
// (`user_index_rejects_out_of_range_index` et al.).
// ===========================================================================

// In range, exactly the element at `index` is dropped: the prefix before it
// and the suffix after it are preserved in order, so the length shrinks by
// one. Out of range — negative included — the list comes back unchanged, the
// no-op callers must reject via the length guard. The index range straddles
// the fuzzed list lengths so both branches are exercised.
test prop_remove_at_shrinks_in_range_and_no_ops_out_of_range(
  args via fuzz.both(fuzz.list(fuzz.int()), fuzz.int_between(-3, 8)),
) {
  let (items, index) = args
  let result = remove_at(items, index)
  if index >= 0 && index < list.length(items) {
    and {
      list.length(result) == list.length(items) - 1,
      list.take(result, index) == list.take(items, index),
      list.drop(result, index) == list.drop(items, index + 1),
    }
  } else {
    result == items
  }
}
