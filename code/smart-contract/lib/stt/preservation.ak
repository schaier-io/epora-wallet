//// State-preservation predicates for the STT spend handlers.
////
//// Each STT action mutates a different subset of `State`. These helpers encode
//// the "which fields must stay equal" check once, so the per-action handlers in
//// the `lib/stt/{operator,user,settlement}_handlers.ak` modules (dispatched from
//// `validators/stt.ak::eval_spend`) stay declarative instead of carrying the
//// field-by-field plumbing.
////
//// Every helper checks preserved fields through `state_preserved_except`.
//// Four named flags permit changes to users, beneficiaries, proof-of-life
//// unlock time, and streams. The predicate builds the expected State and
//// compares it to the output. The multisig threshold, proof-of-life increment,
//// and wallet name always come from the input.
//// `validators/stt.ak::eval_spend` separately guards `intended_stake_credential`
//// and `last_non_admin_payout_at` across their permitted action paths.
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
////   UseBeneficiary(_)                       |   y³   |     -      |    -     |    -    |  -   | earlier removed; final stays unchanged
////   DistributeBeneficiaries(_)              |   -    |     -      |    -     |    -    |  -   | state_completely_unchanged
////   ExitBeneficiary(_)                      |   y³   |     -      |    -     |    -    |  -   | actor always removed
////   PayStreamingPayment(_)                  |   -    |     -      |    -     |    y    |  -   | state_unchanged_except_streaming_payments
////   Consolidate(_)                          |   -    |     -      |    -     |    -    |  -   | state_completely_unchanged
////   CancelStreamingPayment(_)               |   -    |     -      |    -     |    y⁶   |  -   | state_unchanged_except_streaming_payments ⁷
////   StopBeneficiaryStream(_, _)             |   -    |     -      |    -     |    y⁶   |  -   | state_unchanged_except_streaming_payments ⁷
////
////   y  = field may change
////   -  = field must equal input
////   y¹ = only admin path may change wallet_name
////   y² = only the changed user's mutable allowance fields; static user fields
////        and the access-level multi_sig_threshold / beneficiaries are preserved
////   y³ = only the acting beneficiary is removed. UseBeneficiary preserves
////        the final actor, while ExitBeneficiary removes it.
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
////        this matrix and is pinned by the shared cadence helper. Final
////        beneficiary recovery advances the same field without changing a
////        matrix field.

use aiken/collection/list
use aiken/fuzz
use state/types as state_types

/// True when the output preserves every field except those permitted by the
/// named flags. Allowed fields come from the output; preserved fields come
/// from the input. The two centrally guarded fields also come from the output.
fn state_preserved_except(
  input: state_types.State,
  output: state_types.State,
  allow_users: Bool,
  allow_beneficiaries: Bool,
  allow_unlock_time: Bool,
  allow_streaming_payments: Bool,
) -> Bool {
  (state_types.State {
    access: state_types.AccessControl {
      users: if allow_users {
        output.access.users
      } else {
        input.access.users
      },
      beneficiaries: if allow_beneficiaries {
        output.access.beneficiaries
      } else {
        input.access.beneficiaries
      },
      multi_sig_threshold: input.access.multi_sig_threshold,
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: if allow_unlock_time {
        output.proof_of_life.unlock_time
      } else {
        input.proof_of_life.unlock_time
      },
      increment: input.proof_of_life.increment,
    },
    streaming_payments: if allow_streaming_payments {
      output.streaming_payments
    } else {
      input.streaming_payments
    },
    wallet_name: input.wallet_name,
    intended_stake_credential: output.intended_stake_credential,
    last_non_admin_payout_at: output.last_non_admin_payout_at,
  } == output)?
}

/// Every field except proof-of-life `unlock_time` must be equal.
/// Used by: operator Use, proof-of-life renewal.
pub fn state_unchanged_except_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(
    input,
    output,
    allow_users: False,
    allow_beneficiaries: False,
    allow_unlock_time: True,
    allow_streaming_payments: False,
  )
}

/// Access + proof-of-life increment + wallet_name preserved; streaming_payments and
/// proof-of-life unlock_time may change.
/// Used by: ManageStreamingPayments.
pub fn state_unchanged_except_pol_unlock_time_and_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(
    input,
    output,
    allow_users: False,
    allow_beneficiaries: False,
    allow_unlock_time: True,
    allow_streaming_payments: True,
  )
}

/// Multisig threshold + beneficiaries + proof-of-life increment + streaming_payments
/// + wallet_name preserved; users and proof-of-life unlock_time may change.
/// Used by: UseAllowance (and the proof-of-life update inside it).
pub fn state_unchanged_except_users_and_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(
    input,
    output,
    allow_users: True,
    allow_beneficiaries: False,
    allow_unlock_time: True,
    allow_streaming_payments: False,
  )
}

/// Everything preserved. Note this spans only the preservable field set:
/// `intended_stake_credential` and `last_non_admin_payout_at` have no
/// preservation flags because `eval_spend` guards them centrally. This lets
/// SetIntendedStakeCredential and final-beneficiary recovery use this predicate
/// while their handlers validate the one central-field mutation separately.
/// Used by: Consolidate, SetIntendedStakeCredential, final UseBeneficiary.
pub fn state_completely_unchanged(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(
    input,
    output,
    allow_users: False,
    allow_beneficiaries: False,
    allow_unlock_time: False,
    allow_streaming_payments: False,
  )
}

/// Everything preserved except that exactly the acting beneficiary (matched by
/// its unique id) is removed from the beneficiary list. Beneficiary ids are
/// guaranteed unique by `expect_valid_state_configuration`, so filtering by
/// `id != removed` drops exactly one entry.
/// Used by: UseBeneficiary and ExitBeneficiary.
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
    state_preserved_except(
      input,
      output,
      allow_users: False,
      allow_beneficiaries: True,
      allow_unlock_time: False,
      allow_streaming_payments: False,
    )?,
    (output.access.beneficiaries == expected_beneficiaries)?,
  }
}

/// Access + proof-of-life + wallet_name preserved; only streaming_payments may
/// change.
/// Used by: PayStreamingPayment, CancelStreamingPayment, and beneficiary stops.
/// Their cadence-clock
/// handling is enforced separately because that field sits outside this matrix.
pub fn state_unchanged_except_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(
    input,
    output,
    allow_users: False,
    allow_beneficiaries: False,
    allow_unlock_time: False,
    allow_streaming_payments: True,
  )
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
        state_preserved_except(
          input,
          output,
          allow_users: True,
          allow_beneficiaries: False,
          allow_unlock_time: False,
          allow_streaming_payments: False,
        )?,
        (output.access.users == remove_at(input.access.users, index))?,
        (list.length(output.access.users) == list.length(input.access.users) - 1)?,
      }
    state_types.BeneficiaryIndex(index) -> and {
        state_preserved_except(
          input,
          output,
          allow_users: False,
          allow_beneficiaries: True,
          allow_unlock_time: False,
          allow_streaming_payments: False,
        )?,
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
  if index < 0 {
    items
  } else {
    when items is {
      [] -> []
      [head, ..tail] ->
        if index == 0 {
          tail
        } else {
          [head, ..remove_at(tail, index - 1)]
        }
    }
  }
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
