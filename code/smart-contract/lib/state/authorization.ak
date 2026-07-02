//// State-side authorization checks: do the right keys sign for the requested
//// `OperatorPath` / beneficiary unlock / consolidation path?
////
//// SECURITY INVARIANTS (intentional design choices — see README §"Role Model
//// & Trust Boundaries"):
//// - A single payment-key-hash may appear in multiple `user_wallets`. Each
////   record's multisig power is counted independently, so duplicates raise
////   the effective signer weight. Covered by
////   `security_intentional__multisig_shared_key_counts_each_role_*`.
////   FOOTGUN (intended, but sharp): because power is summed PER RECORD and a
////   key may appear in several records, ONE signature from a key placed in two
////   multisig-powered user records contributes 2x its power toward the
////   threshold. A `multi_sig_threshold` that looks like it needs several
////   distinct signers can therefore be satisfiable by a single key. Config
////   validation enforces unique user *ids*, NOT unique keys, so this is not
////   rejected on-chain — the off-chain config UI is responsible for surfacing
////   duplicate keys across multisig-powered records. Do not assume "threshold
////   N" implies "N distinct humans".
//// - A beneficiary key may also be a user key. Recovery designs need this
////   overlap; configuration explicitly allows it.
//// - Admins always satisfy `has_operator_authority(_, _, Admin)`; multisig
////   satisfaction is gated on the configured `multi_sig_threshold`.
////
//// See also `lib/state/proof_of_life.ak` for the time-window logic that
//// `expect_single_beneficiary_with_unlock_authority` consults.

use aiken/collection/list
use aiken/interval
use cardano/address.{Address, Script, VerificationKey}
use cardano/transaction.{Transaction, ValidityRange, placeholder}
use state/configuration
use state/proof_of_life
use state/types as state_types
use state/types.{Beneficiary, ConsolidatePath, OperatorPath, State, User}

/// True if the beneficiary's unlock window has elapsed AND the tx is signed
/// by one of the beneficiary's wallets AND no other beneficiary shares a
/// wallet with this one.
///
/// The "unlock window" is the LATER of:
///   - `beneficiary.unlock_after` (per-beneficiary delay; optional), and
///   - `state.proof_of_life.unlock_time` (global liveness window).
/// Both windows must have elapsed before the beneficiary may unlock — see
/// `lib/state/proof_of_life.ak::calculate_beneficiary_unlock_time` for the
/// max computation and `is_unlock_time_reached` for the bound check.
fn has_beneficiary_unlock_authority(
  transaction: Transaction,
  validity_range: ValidityRange,
  state: State,
  beneficiary: Beneficiary,
) -> Bool {
  let unlock_time = proof_of_life.calculate_beneficiary_unlock_time(
    beneficiary.unlock_after,
    state,
  )

  let unlock_window_elapsed = proof_of_life.is_unlock_time_reached(
    validity_range,
    unlock_time,
  )
  let beneficiary_wallets_distinct = configuration.expect_beneficiary_wallets_are_distinct_from_others(
    beneficiary,
    state.access.beneficiaries,
  )
  let beneficiary_signed = wallet_list_has_signature(
    transaction.extra_signatories,
    beneficiary.beneficiary_wallets,
  )
  and {
    unlock_window_elapsed?,
    beneficiary_wallets_distinct?,
    beneficiary_signed?,
  }
}

/// Return the only beneficiary that is currently allowed to unlock funds.
pub fn expect_single_beneficiary_with_unlock_authority(
  transaction: Transaction,
  validity_range: ValidityRange,
  state: State,
) -> Beneficiary {
  let matching_beneficiaries = list.filter(
    state.access.beneficiaries,
    fn(beneficiary) {
      has_beneficiary_unlock_authority(
        transaction,
        validity_range,
        state,
        beneficiary,
      )
    },
  )

  expect [beneficiary] = matching_beneficiaries
  beneficiary
}

/// Resolve operator authority through the selected access path. Both paths key
/// off the same question — "did this user sign the tx?" — so they share one
/// `signed` predicate: Admin needs any signed `is_admin` user; Multisig needs the
/// signed users' weighted power to meet the threshold (same arithmetic the
/// config-time reachability check uses, via `multisig_threshold_is_met`).
pub fn has_operator_authority(
  transaction: Transaction,
  state: State,
  operator_path: OperatorPath,
) -> Bool {
  let signed = fn(user: User) {
    wallet_list_has_signature(transaction.extra_signatories, user.user_wallets)
  }
  when operator_path is {
    state_types.Admin ->
      list.any(state.access.users, fn(user) { user.is_admin && signed(user) })
    state_types.Multisig ->
      configuration.multisig_threshold_is_met(
        state.access.users,
        state.access.multi_sig_threshold,
        signed,
      )
  }
}

/// Any beneficiary whose unlock window has elapsed and who signed the tx. The
/// authority an unlocked beneficiary holds independently of the operator set:
/// it gates BeneficiaryPath consolidation below and marks a streaming-payment
/// crank as AUTHORIZED (cooldown bypass; see the whitepaper's Settlement-cadence
/// theorem) — the recovery actor settling
/// every stream before the terminal sweep must not be rate-limited like an
/// unauthenticated cranker.
pub fn has_unlocked_beneficiary_authority(
  transaction: Transaction,
  validity_range: ValidityRange,
  state: State,
) -> Bool {
  list.any(
    state.access.beneficiaries,
    fn(beneficiary) {
      has_beneficiary_unlock_authority(
        transaction,
        validity_range,
        state,
        beneficiary,
      )
    },
  )
}

/// Consolidation may be authorized by admin, multisig, or an unlocked beneficiary.
pub fn has_consolidate_authority(
  transaction: Transaction,
  validity_range: ValidityRange,
  state: State,
  consolidate_path: ConsolidatePath,
) -> Bool {
  when consolidate_path is {
    state_types.AdminPath ->
      has_operator_authority(transaction, state, state_types.Admin)
    state_types.MultisigPath ->
      has_operator_authority(transaction, state, state_types.Multisig)
    state_types.BeneficiaryPath ->
      has_unlocked_beneficiary_authority(transaction, validity_range, state)
  }
}

/// True when the PAYEE of a streaming payment authorized this tx: its
/// `payout_address` has a VerificationKey payment credential whose hash is among
/// the tx signatories. This is the authority for the `CancelStreamingPayment`
/// path — a payee may stop its OWN stream by signing, independently of the
/// operator set.
///
/// A Script-credential `payout_address` cannot produce an `extra_signatory`, so it
/// has NO self-cancel authority here and returns `False`: such a payee stops its
/// stream through the operator `ManageStreamingPayments` path instead. The stake
/// credential is irrelevant to signing and is ignored.
pub fn has_streaming_payment_payee_authority(
  transaction: Transaction,
  payout_address: Address,
) -> Bool {
  when payout_address.payment_credential is {
    VerificationKey(payee_key_hash) ->
      list.has(transaction.extra_signatories, payee_key_hash)
    Script(_) -> False
  }
}

// Check whether any wallet in the given list signed the transaction.
fn wallet_list_has_signature(
  signatories: List<ByteArray>,
  wallets: List<ByteArray>,
) -> Bool {
  list.any(wallets, fn(wallet) { list.has(signatories, wallet) })
}

test beneficiary_unlock_authority_accepts_signed_unlocked_beneficiary() {
  let beneficiary = Beneficiary {
    id: 1,
    beneficiary_wallets: ["beneficiary1"],
    unlock_after: Some(100),
    weight: 1,
  }
  let state = State {
    access: state_types.AccessControl {
      users: [],
      multi_sig_threshold: None,
      beneficiaries: [beneficiary],
    },
    proof_of_life: state_types.ProofOfLifeSettings {
      unlock_time: Some(100),
      increment: Some(50),
    },
    wallet_name: #"",
    streaming_payments: [],
    intended_stake_credential: None,
    last_permissionless_payout_at: None,
  }
  let transaction = Transaction {
    ..placeholder,
    validity_range: interval.after(100),
    extra_signatories: ["beneficiary1"],
    id: #"2230000000000000000000000000000000000000000000000000000000000009",
  }

  expect
    has_beneficiary_unlock_authority(
      transaction,
      transaction.validity_range,
      state,
      beneficiary,
    )
}
