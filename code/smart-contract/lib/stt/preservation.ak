//// State-preservation predicates for the STT spend handlers.
////
//// Each STT action mutates a different subset of `State`. These helpers encode
//// the "which fields must stay equal" check once, so the per-action handlers in
//// `validators/stt.ak` stay declarative. Extracted out of the validator so the
//// validator file holds the decision logic, not the field-by-field plumbing.
////
//// State mutation matrix — which fields each action allows to change:
////
////   action                            | access | pol.unlock | pol.incr | subs | name | helper
////   ----------------------------------+--------+------------+----------+------+------+--------------------------------------------------
////   RunOperator(Use)                  |   -    |     y      |    -     |  -   |  -   | state_unchanged_except_pol_unlock_time
////   RunOperator(UpdateState)          |   y    |     y      |    y     |  -   |  y¹  | (inline; no preservation helper — arbitrary)
////   RunOperator(ManageStreamingPayments)  |   -    |     y      |    -     |  y   |  -   | state_unchanged_except_pol_unlock_time_and_streaming_payments
////   RenewProofOfLife                  |   -    |     y      |    -     |  -   |  -   | state_unchanged_except_pol_unlock_time
////   UseAllowance(_)                   |   y²   |     y      |    -     |  -   |  -   | state_unchanged_except_users_and_pol_unlock_time
////   UseBeneficiary(_)                 |   y³   |     -      |    -     |  -   |  -   | state_unchanged_except_beneficiary_removed
////   PayStreamingPayment(_)                |   -    |     -      |    -     |  y   |  -   | state_unchanged_except_streaming_payments
////   Consolidate(_)                    |   -    |     -      |    -     |  -   |  -   | state_completely_unchanged
////
////   y  = field may change
////   -  = field must equal input
////   y¹ = only admin path may change wallet_name
////   y² = only the changed user's mutable allowance fields; static user fields
////        and the access-level multi_sig_threshold / beneficiaries are preserved
////   y³ = only the acting beneficiary is removed from access.beneficiaries;
////        users and multi_sig_threshold are preserved

use aiken/collection/list
use state/types as state_types

// Every field except proof-of-live `unlock_time` must be equal.
// Used by: operator Use, proof-of-live renewal.
pub fn state_unchanged_except_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  and {
    input.access == output.access,
    input.proof_of_life.increment == output.proof_of_life.increment,
    input.streaming_payments == output.streaming_payments,
    input.wallet_name == output.wallet_name,
  }
}

// Access + proof-of-live increment + wallet_name preserved; streaming_payments and
// proof-of-live unlock_time may change.
// Used by: ManageStreamingPayments.
pub fn state_unchanged_except_pol_unlock_time_and_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  and {
    input.access == output.access,
    input.proof_of_life.increment == output.proof_of_life.increment,
    input.wallet_name == output.wallet_name,
  }
}

// Multisig threshold + beneficiaries + proof-of-live increment + streaming_payments
// + wallet_name preserved; users and proof-of-live unlock_time may change.
// Used by: UseAllowance (and the proof-of-life update inside it).
pub fn state_unchanged_except_users_and_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  and {
    input.access.multi_sig_threshold == output.access.multi_sig_threshold,
    input.access.beneficiaries == output.access.beneficiaries,
    input.proof_of_life.increment == output.proof_of_life.increment,
    input.streaming_payments == output.streaming_payments,
    input.wallet_name == output.wallet_name,
  }
}

// Everything preserved.
// Used by: Consolidate.
pub fn state_completely_unchanged(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  and {
    input.access == output.access,
    input.proof_of_life == output.proof_of_life,
    input.streaming_payments == output.streaming_payments,
    input.wallet_name == output.wallet_name,
  }
}

// Everything preserved except that exactly the acting beneficiary (matched by
// its unique id) is removed from the beneficiary list. Beneficiary ids are
// guaranteed unique by `expect_valid_state_configuration`, so filtering by
// `id != removed` drops exactly one entry.
// Used by: UseBeneficiary.
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
    input.access.users == output.access.users,
    input.access.multi_sig_threshold == output.access.multi_sig_threshold,
    output.access.beneficiaries == expected_beneficiaries,
    input.proof_of_life == output.proof_of_life,
    input.streaming_payments == output.streaming_payments,
    input.wallet_name == output.wallet_name,
  }
}

// Access + proof-of-live + wallet_name preserved; only streaming_payments may
// change.
// Used by: PayStreamingPayment.
pub fn state_unchanged_except_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  and {
    input.access == output.access,
    input.proof_of_life == output.proof_of_life,
    input.wallet_name == output.wallet_name,
  }
}

// Everything preserved except `intended_stake_credential`.
// Used by: SetIntendedStakeCredential.
pub fn state_unchanged_except_intended_stake_credential(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  and {
    input.access == output.access,
    input.proof_of_life == output.proof_of_life,
    input.streaming_payments == output.streaming_payments,
    input.wallet_name == output.wallet_name,
  }
}

// Output equals the input with exactly the entry at `index` removed from the
// targeted access list, and every other field preserved. The
// `length == input - 1` guard rejects an out-of-range index (`remove_at` is then
// a no-op, leaving the length unchanged).
// Used by: RemoveAccessIndex.
pub fn state_unchanged_except_access_index_removed(
  input: state_types.State,
  output: state_types.State,
  target: state_types.AccessIndexTarget,
) -> Bool {
  when target is {
    state_types.UserIndex(index) -> and {
        output.access.users == remove_at(input.access.users, index),
        list.length(output.access.users) == list.length(input.access.users) - 1,
        input.access.beneficiaries == output.access.beneficiaries,
        input.access.multi_sig_threshold == output.access.multi_sig_threshold,
        input.proof_of_life == output.proof_of_life,
        input.streaming_payments == output.streaming_payments,
        input.wallet_name == output.wallet_name,
      }
    state_types.BeneficiaryIndex(index) -> and {
        output.access.beneficiaries == remove_at(
          input.access.beneficiaries,
          index,
        ),
        list.length(output.access.beneficiaries) == list.length(
          input.access.beneficiaries,
        ) - 1,
        input.access.users == output.access.users,
        input.access.multi_sig_threshold == output.access.multi_sig_threshold,
        input.proof_of_life == output.proof_of_life,
        input.streaming_payments == output.streaming_payments,
        input.wallet_name == output.wallet_name,
      }
  }
}

// Drop the element at `index` (0-based). An out-of-range or negative `index`
// returns the list unchanged, so callers MUST assert the length decreased.
pub fn remove_at(items: List<a>, index: Int) -> List<a> {
  list.concat(list.take(items, index), list.drop(items, index + 1))
}
