//// Core on-chain data model: the STT datum (`State`), redeemer (`SttAction`),
//// and supporting access-control records.
////
//// NAMING CONVENTIONS (used across `lib/state/*`, `lib/streaming_payments/*`,
//// `lib/wallet/*`):
////   `is_*` / `has_*` / `*_are_*` / `*_is_valid`  — pure Bool predicate
////       (returns Bool; never uses `expect` internally).
////   `expect_*`                                   — validator that fails the
////       transaction via `expect` if the property does not hold; may return
////       Bool, a value, or unit.
////   `calculate_*` / `total_*` / `effective_*`    — pure computation
////       returning a value, no Bool, no expect.

use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Credential}
use streaming_payments/types as streaming_payment_type
use time/types.{POSIXTime}

/// One entry in a flat multi-asset bundle (allowance, payout delta, …).
///   - `policy_id`  — Cardano minting policy id (28 bytes for non-lovelace;
///                    empty bytestring for ADA).
///   - `asset_name` — token name under that policy (empty for ADA).
///   - `quantity`   — signed quantity (positive means in the bundle).
///
/// A named record (rather than a `(ByteArray, ByteArray, Int)` tuple) so call
/// sites read as `entry.quantity` instead of `entry.3rd`. Bridge to/from stdlib
/// `assets.flatten(value)` (which yields tuples) with
/// `assets/entries.{asset_entry, flatten_to_entries}`.
pub type AssetEntry {
  policy_id: ByteArray,
  asset_name: ByteArray,
  quantity: Int,
}

/// Flat representation of a multi-asset bundle.
pub type AssetEntries =
  List<AssetEntry>

/// A recovery recipient that may withdraw once the wallet's proof-of-life
/// window (and the beneficiary's own `unlock_after` delay) has elapsed.
///
/// `weight` defines a *proportional* share of the distributable wallet pool,
/// not an independent percentage. On withdrawal the beneficiary may take up to
/// `weight / (sum of weights of all beneficiaries still present) ×
/// (wallet value − streaming-payment reserve)` per asset, and is then REMOVED
/// from the state (one-shot). Because the weight is retired on use, the shares
/// of any subset always sum to the whole pool regardless of withdrawal order,
/// and a removed beneficiary can never withdraw again. `weight` must be `>= 1`.
pub type Beneficiary {
  id: Int,
  beneficiary_wallets: List<VerificationKeyHash>,
  unlock_after: Option<POSIXTime>,
  weight: Int,
}

/// Two authority-path enums, intentionally NOT unified into one. `OperatorPath`
/// gates operator actions, reachable only by admin or a multisig quorum.
/// `ConsolidatePath` additionally admits `BeneficiaryPath`: an unlocked
/// beneficiary may consolidate wallet UTxOs but may never run an operator action.
/// That extra variant is why these stay distinct types.
pub type OperatorPath {
  Admin
  Multisig
}

/// Authority path for `Consolidate` — see `OperatorPath` above for why the two
/// enums stay distinct.
pub type ConsolidatePath {
  AdminPath
  MultisigPath
  BeneficiaryPath
}

/// One live wallet identity: its signing keys (`user_wallets`), allowance
/// budget (`per_day_allowance` refills `remaining_allowance` at
/// `next_allowance_reset`), optional liveness-keeper right
/// (`can_renew_proof_of_life`), weighted multisig power, and the admin flag.
pub type User {
  id: Int,
  user_wallets: List<VerificationKeyHash>,
  per_day_allowance: AssetEntries,
  remaining_allowance: AssetEntries,
  next_allowance_reset: POSIXTime,
  can_renew_proof_of_life: Bool,
  multi_sig_power: Option<Int>,
  is_admin: Bool,
}

/// The allowance view that applies at the current transaction time, after an
/// (possible) expiry reset — computed by `state/allowance.expect_allowance_updates`.
pub type EffectiveAllowance {
  remaining_allowance: AssetEntries,
  next_allowance_reset_after_use: POSIXTime,
}

/// One validated allowance-use diff: which user's wallets must sign
/// (`changed_user_wallets`) and the delta the wallet payout must equal
/// (`spent_allowance`).
pub type AllowanceUpdate {
  changed_user_wallets: List<VerificationKeyHash>,
  spent_allowance: AssetEntries,
}

/// The wallet's access-control record: users (with their multisig weights),
/// the weighted multisig threshold, and the recovery beneficiaries.
pub type AccessControl {
  users: List<User>,
  multi_sig_threshold: Option<Int>,
  beneficiaries: List<Beneficiary>,
}

/// Dead-man-switch settings: beneficiaries unlock once `unlock_time` lapses; a
/// renewal may push it forward by at most `increment` per heartbeat. Both fields
/// are set together or not at all (`proof_of_life.expect_valid_settings`).
pub type ProofOfLifeSettings {
  unlock_time: Option<POSIXTime>,
  increment: Option<Int>,
}

/// The STT datum: the wallet's complete on-chain state. Carried inline on the
/// single STT UTxO and rewritten by every `SttAction` transition.
pub type State {
  access: AccessControl,
  proof_of_life: ProofOfLifeSettings,
  streaming_payments: List<streaming_payment_type.StreamingPayment>,
  wallet_name: ByteArray,
  /// The stake credential every continuing WALLET output must carry. `None`
  /// means the wallet is an enterprise address (no delegation), matching the
  /// current off-chain `resolvePlutusScriptAddress` build. The wallet validator
  /// rejects any continuing wallet output whose stake credential differs, so no
  /// spend (including the permissionless `PayStreamingPayment` crank) can
  /// re-home wallet funds under a foreign ("Franken") stake credential. Wallet
  /// INPUTS are still aggregated by payment credential, so out-of-sync legacy
  /// UTxOs at other stake credentials can be swept back in. Changeable ONLY via
  /// the admin/multisig `SetIntendedStakeCredential` operator action.
  intended_stake_credential: Option<Credential>,
  /// Upper-bound timestamp of the most recent PERMISSIONLESS
  /// `PayStreamingPayment` crank (the tx `invalid_hereafter`), or `None` if none
  /// has happened. The next permissionless crank's lower bound must be at least
  /// `constants.permissionless_payout_cooldown_ms` past this stamp. An AUTHORIZED
  /// co-signature (admin, multisig quorum, or unlocked beneficiary) bypasses the
  /// cooldown AND does NOT advance this field — it tracks only the unauthenticated
  /// path, so an operator/recovery crank never delays a later permissionless one.
  /// Only a PERMISSIONLESS crank advances it; every other transition AND every
  /// authorized crank preserves it — non-crank preservation is enforced centrally
  /// in `eval_spend` (like `intended_stake_credential`), the authorized-crank
  /// preservation in `eval_pay_streaming_payment`. Initialised to `None` at mint.
  /// See the whitepaper's Settlement-cadence theorem.
  last_permissionless_payout_at: Option<POSIXTime>,
}

/// Selects a single access-control entry to remove by its position in the
/// corresponding list of the consumed STT state. Used by the cheap
/// `RemoveAccessIndex` operator action: the index is resolved against the exact
/// STT input being spent, so it is unambiguous (a single STT thread means no
/// concurrent reordering can shift it between build and submit).
pub type AccessIndexTarget {
  /// Remove `access.users` at this index.
  UserIndex(Int)
  /// Remove `access.beneficiaries` at this index.
  BeneficiaryIndex(Int)
}

/// The operator sub-action selected by `RunOperator`. `Use` spends the wallet;
/// the others reconfigure state without moving wallet funds.
pub type OperatorActionKind {
  Use
  UpdateState
  ManageStreamingPayments
  /// Cheap, operator-authorized removal of ONE access entry (a user or a
  /// beneficiary) by list index. Unlike `UpdateState` it does not re-run the
  /// (super-linear) full configuration validation, only the recovery-reachability
  /// shape check, so it stays affordable even if execution-budget parameters
  /// tighten, and is exempt from the access-list size caps so an over-cap wallet
  /// can always shrink back one entry at a time. No wallet spend.
  ///
  /// There is deliberately NO cheap "add" counterpart: growth must go through
  /// the full-validation `UpdateState`, which is the most expensive transition
  /// (it re-runs the O(n²) configuration validation). So an add that would push
  /// a wallet toward the execution-budget ceiling fails BEFORE any cheaper
  /// remove or normal spend would — you can never grow into a state you can no
  /// longer operate or recover from. See the whitepaper Security Analysis
  /// ("Bounded execution cost").
  RemoveAccessIndex(AccessIndexTarget)
  /// Admin/multisig-admin-only: set the wallet's `intended_stake_credential`
  /// (see `State`). Carries the new value (`None` = enterprise / no delegation).
  /// No wallet spend; ONLY that one State field changes. Isolated to this
  /// dedicated path so the expensive, arbitrary `UpdateState` cannot touch it —
  /// changing where wallet funds delegate is a deliberate, narrowly-authorized
  /// act, not a side effect of a config edit.
  SetIntendedStakeCredential(Option<Credential>)
}

/// An operator action: which authority path must have signed (`path`) and which
/// sub-rule applies (`kind`).
pub type OperatorAction {
  path: OperatorPath,
  kind: OperatorActionKind,
}

// The STT datum is the State itself — no wrapper.

/// STT spend redeemer. Each variant carries the wallet-side payload that the
/// STT validator proves consistent with the state diff, and that the wallet
/// validator then uses to bound wallet movement. The payload lives on the
/// redeemer (not a parallel datum field), so there is a single encoding to keep
/// consistent.
pub type SttAction {
  /// Operator-driven action (admin or multisig). The kind selects the
  /// sub-rule (`Use`, `UpdateState`, `ManageStreamingPayments`).
  RunOperator(OperatorAction)
  /// A non-admin user with renewal rights extends the proof-of-live window.
  RenewProofOfLife
  /// A user spends part of their per-day allowance. The payload is the
  /// `spent_allowance` delta the wallet payout must equal exactly.
  UseAllowance(AssetEntries)
  /// A beneficiary unlocks the wallet for its weighted share. The payload is
  /// the beneficiary's `id` (matches `Beneficiary.id` in the state). The acting
  /// beneficiary is removed from the state in the same transition (one-shot).
  UseBeneficiary(Int)
  /// A streaming-payment payout settles. The payload is the `payout_delta` the
  /// wallet must move into tagged streaming-payment outputs.
  PayStreamingPayment(AssetEntries)
  /// Wallet consolidation under the chosen authority path. No wallet value
  /// change is permitted.
  Consolidate(ConsolidatePath)
  /// A streaming-payment PAYEE stops its OWN stream. The payload is the
  /// streaming-payment `id`. Authorized by the payee's signature (the
  /// `payout_address` payment key — NOT an operator), it moves that one payment's
  /// `end_date` down to the tx upper bound ("now"): never up (no extend), never
  /// below the no-clawback floor, and it changes nothing else in the State or the
  /// other payments. One-shot — real streaming-payment progress is required, so it
  /// cannot be replayed to occupy the single STT thread. A script-credential payee
  /// cannot sign, so it has no self-cancel path (operators stop such a stream via
  /// `ManageStreamingPayments`). Declared LAST so the existing constructor indices
  /// (0..5) are unchanged. No wallet spend.
  CancelStreamingPayment(Int)
}

/// True iff `action` is the dedicated `SetIntendedStakeCredential` operator
/// action — the ONLY action permitted to change `State.intended_stake_credential`.
/// `validators/stt.ak::eval_spend` uses this as the single exemption to its
/// central "preserve the intended stake credential" guard, so the classification
/// lives here beside `SttAction` rather than inline in the validator.
pub fn is_set_intended_stake_credential_action(action: SttAction) -> Bool {
  when action is {
    RunOperator(operator_action) ->
      when operator_action.kind is {
        SetIntendedStakeCredential(_) -> True
        _ -> False
      }
    _ -> False
  }
}

/// True iff `action` is a `PayStreamingPayment` crank — the ONLY action permitted
/// to touch `State.last_permissionless_payout_at` (the crank-cooldown clock).
/// `validators/stt.ak::eval_spend` uses this as the single exemption to its
/// central "preserve the cooldown clock" guard.
pub fn is_pay_streaming_payment_action(action: SttAction) -> Bool {
  when action is {
    PayStreamingPayment(_) -> True
    _ -> False
  }
}
