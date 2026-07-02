//// State-preservation predicates for the STT spend handlers.
////
//// Each STT action mutates a different subset of `State`. These helpers encode
//// the "which fields must stay equal" check once, so the per-action handlers in
//// `validators/stt.ak` stay declarative. Extracted out of the validator so the
//// validator file holds the decision logic, not the field-by-field plumbing.
////
//// Every helper routes its "unchanged field" checks through ONE enumeration of
//// the preservable `State` fields (`StateField` + `state_preserved_except`), so a
//// new field is added in a single place and is then preserved by DEFAULT across
//// every action (opt-OUT via a `mutable` list, never opt-in — a field a future
//// author forgets stays locked, it does not silently become mutable). This
//// mirrors `streaming_payments/types.core_fields_match` for the streaming-payment
//// record. `intended_stake_credential` and `last_permissionless_payout_at` are
//// deliberately NOT in the set: they are preserved CENTRALLY in
//// `validators/stt.ak::eval_spend` (every action but their one dedicated
//// mutator), so they never appear in a per-handler check here.
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

/// The set of `State` fields some action is allowed to mutate, so a preservation
/// check reads as "everything equal EXCEPT these". THE single enumeration of the
/// preservable field set: adding a `State` field means adding one variant here
/// plus one arm in `state_preserved_except`, after which every helper below
/// preserves it by default. `access` is split into its three sub-fields (actions
/// mutate different parts of it) and `proof_of_life` into its two. Excludes
/// `intended_stake_credential` and `last_permissionless_payout_at` — those are
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

/// Every field except proof-of-live `unlock_time` must be equal.
/// Used by: operator Use, proof-of-life renewal.
pub fn state_unchanged_except_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [PolUnlockTime])
}

/// Access + proof-of-live increment + wallet_name preserved; streaming_payments and
/// proof-of-live unlock_time may change.
/// Used by: ManageStreamingPayments.
pub fn state_unchanged_except_pol_unlock_time_and_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [PolUnlockTime, StreamingPayments])
}

/// Multisig threshold + beneficiaries + proof-of-live increment + streaming_payments
/// + wallet_name preserved; users and proof-of-live unlock_time may change.
/// Used by: UseAllowance (and the proof-of-life update inside it).
pub fn state_unchanged_except_users_and_pol_unlock_time(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [AccessUsers, PolUnlockTime])
}

/// Everything preserved.
/// Used by: Consolidate.
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

/// Access + proof-of-live + wallet_name preserved; only streaming_payments may
/// change.
/// Used by: PayStreamingPayment.
pub fn state_unchanged_except_streaming_payments(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [StreamingPayments])
}

/// Everything in the normal field set preserved. `intended_stake_credential` (the
/// field this action actually changes) is NOT a `StateField` — it is guarded
/// centrally in `eval_spend` — so "preserve everything else" is the empty-mutable
/// call, and the handler asserts the new credential value separately.
/// Used by: SetIntendedStakeCredential.
pub fn state_unchanged_except_intended_stake_credential(
  input: state_types.State,
  output: state_types.State,
) -> Bool {
  state_preserved_except(input, output, [])
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
pub fn remove_at(items: List<a>, index: Int) -> List<a> {
  list.concat(list.take(items, index), list.drop(items, index + 1))
}
