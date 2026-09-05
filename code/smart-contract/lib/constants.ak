//// Shared numeric constants used across the contracts.
////
//// Centralized here so that semantic meaning is documented exactly once and
//// every consumer references the same source of truth.

/// Number of POSIX milliseconds in a single day.
///
/// Used to:
/// - Reset the per-user allowance window (`state/allowance`).
/// - Scale streaming_payment `amount_per_day` to ledger-second precision
///   (`streaming_payments/funding`).
pub const milliseconds_per_day: Int = 86_400_000

/// Upper bound on the number of `User` records a `State` may hold.
///
/// Bounds the ExUnit and transaction-size work of validating and transitioning a wallet:
/// configuration validation is super-linear in the access lists (`list.unique`
/// on ids plus per-record allowance/wallet checks), so an unbounded list could
/// grow a wallet past the per-transaction execution budget and strand it.
/// Enforced at mint and on every `UpdateState` via
/// `state/configuration.expect_valid_state_configuration`, and mirrored
/// off-chain in `state-validation.ts`. The per-entry removal path
/// (`RemoveAccessIndex`) is deliberately exempt. A decodable over-cap list can
/// shrink while each removal stays within the current execution limits.
pub const max_users: Int = 10

/// Upper bound on the number of `Beneficiary` records a `State` may hold.
///
/// Beneficiary validation is quadratic (id uniqueness plus pairwise wallet
/// distinctness), so it is capped for the same execution-budget reason as
/// `max_users`, and enforced alongside it.
pub const max_beneficiaries: Int = 15

/// Upper bound on user and beneficiary records combined.
///
/// The separate record caps remain useful for clear field validation, while
/// this aggregate cap prevents one State from multiplying both lists to their
/// independent maxima. Enforced on mint and `UpdateState`.
pub const max_access_records: Int = 15

/// Upper bound on the number of `StreamingPayment` records a `State` may hold.
///
/// Enforced in `streaming_payments/shape.is_valid`, which runs over the whole
/// output set at mint and on every `ManageStreamingPayments` (the add/forward
/// path), so the cap bounds the set however it grew.
pub const max_streaming_payments: Int = 15

/// Upper bound on positive streaming-payment settlements in one transaction.
///
/// The validator still walks the full schedule list, but each positive change
/// also scans payout outputs and runs wallet-side routing. Limiting that work
/// bounds the named maximum-shape fixture used by the repository budget gate. Settled
/// entries with a zero value change do not count, so one transaction can still
/// remove any number of zero-value entries.
pub const max_streaming_payouts_per_transaction: Int = 2

// ---------------------------------------------------------------------------
// Inner-collection caps (audit finding A1).
//
// The record-count caps above bound the OUTER `State` lists, but the inner
// collections those records carry — a user's wallet/allowance lists, a
// beneficiary's wallet list, and the wallet name — are equally part of the
// per-transition execution cost. Left unbounded, a privileged `UpdateState`
// (or a mint, or a buggy off-chain builder) could commit a `State` whose datum
// is cheap enough to CREATE yet so large to decode/scan that some later
// transition exceeds the per-tx execution budget and STRANDS the wallet
// (`RemoveAccessIndex` cannot help — it must still decode the full datum). So
// every attacker-/operator-influenceable collection gets an explicit cap. A
// separate aggregate cap bounds beneficiary wallets because multiplying the
// two per-record caps would exceed the execution budget. Enforced in
// `state/configuration.expect_valid_state_configuration` (mint + `UpdateState`)
// and, for the allowance bundle that the `UseAllowance` path can also grow, in
// `state/allowance.expect_allowance_update`. Mirrored off-chain in
// `state-validation.ts`. See the whitepaper Security Analysis ("Bounded
// execution cost").

/// Upper bound on the number of payment-key wallets one `User` record may list.
pub const max_wallets_per_user: Int = 10

/// Upper bound on the number of payment-key wallets one `Beneficiary` may list.
pub const max_beneficiary_wallets: Int = 10

/// Upper bound on beneficiary wallets across the complete `State`.
///
/// Global uniqueness is quadratic in this total. The per-beneficiary and
/// beneficiary-count limits therefore cannot be multiplied safely.
pub const max_total_beneficiary_wallets: Int = 15

/// Upper bound on user wallet ids across the complete `State`.
///
/// User wallet ids are scanned on authorization paths. This cap prevents the
/// per-user limit from multiplying across every user record.
pub const max_total_user_wallets: Int = 15

/// Maximum wallet-script inputs in a value-moving transaction.
///
/// Each input executes the wallet validator again, so normal spends must use a
/// single input and let the off-chain builder submit another transaction for
/// any remainder.
pub const max_wallet_inputs_per_spend: Int = 1

/// Maximum wallet-script inputs in a consolidation transaction.
///
/// Two inputs are the minimum useful merge. A larger compatible set needs
/// pairwise transactions. Each pair must also fit the five-native-asset cap.
pub const max_wallet_inputs_per_consolidation: Int = 2

/// Upper bound on transaction inputs inspected by either validator.
///
/// Larger transactions must consolidate funding inputs first. This bounds the
/// full-list scans used to locate the STT and wallet input group.
pub const max_transaction_inputs: Int = 4

/// Upper bound on transaction outputs inspected by either validator.
pub const max_transaction_outputs: Int = 4

/// Upper bound on required signer hashes inspected for wallet authority.
/// Ten permits one signer for every user record in a full multisig path.
pub const max_transaction_signatories: Int = 10

/// Upper bound on script redeemers in a normal STT transaction.
///
/// Three permits the STT plus both wallet inputs of a consolidation.
pub const max_transaction_redeemers: Int = 3

/// Governance transactions permit the STT and one wallet purpose only.
pub const max_governance_transaction_redeemers: Int = 2

/// Cardano verification-key and script credential hashes are Blake2b-224.
/// Aiken represents them as `ByteArray`, so every State ingress path must pin
/// the ledger width explicitly instead of trusting the type alias.
pub const credential_hash_bytes: Int = 28

/// Native-asset policy ids are Blake2b-224 script hashes.
pub const policy_id_bytes: Int = 28

/// Cardano native-asset names contain at most 32 bytes (empty is valid).
pub const max_asset_name_bytes: Int = 32

/// Largest integer accepted in persistent State and action payloads.
///
/// This is the signed 64-bit ledger quantity ceiling. Bounding scalar width
/// prevents a compact CBOR bignum from making later arithmetic unaffordable.
pub const max_state_integer: Int = 9_223_372_036_854_775_807

/// Upper bound on the number of `(policy_id, asset_name)` entries one allowance
/// bundle (`per_day_allowance` or `remaining_allowance`) may hold. Capped on
/// BOTH the config path and the `UseAllowance` update path, because a spend can
/// otherwise pad `remaining_allowance` with extra (e.g. zero-quantity) entries.
pub const max_allowance_entries: Int = 5

/// Upper bound on allowance entries across all users and both allowance lists.
///
/// Counts `per_day_allowance` and `remaining_allowance` entries. Mint and
/// `UpdateState` enforce it for the full State. `UseAllowance` also enforces it
/// because that transition may replace `remaining_allowance` entries.
pub const max_total_allowance_entries: Int = 15

/// Native-asset rows a bounded wallet action may scan on each wallet side.
///
/// Ada does not count. The cap applies to allowance use, non-terminal
/// beneficiary draws, and consolidation. Operator use has no five-asset cap.
/// Terminal recovery has no five-asset cap for its one consumed wallet input.
pub const max_bounded_wallet_native_assets: Int = 5

/// Upper bound on the byte length of the optional human `wallet_name` label.
/// Matches the shipped off-chain limit (`state-wallet-name.ts::MAX_WALLET_NAME_BYTES`).
pub const max_wallet_name_bytes: Int = 32

// ---------------------------------------------------------------------------
// Non-admin streaming-action cadence limit (whitepaper:
// Settlement-cadence theorem).
//
// The `PayStreamingPayment` crank is the widest-authority spend: an admin, a
// multisig quorum, ANY listed user, ANY stream payee, or an unlocked beneficiary
// may submit it. Each of those can therefore consume and re-create the single STT
// thread, contending with the owner's transactions — including a proof-of-life
// renewal, whose stalling could lapse the dead-man-switch. To bound that
// contention, a NON-ADMIN crank must land at least this long after the previous
// cadence-limited action. Receiver `CancelStreamingPayment` shares the same
// clock because it consumes the same singleton thread. Each action stamps the
// State's legacy-named `last_non_admin_payout_at` with the tx UPPER bound, and
// the next one requires its LOWER bound to be at least this far past that stamp.
// ONLY an admin payout bypasses the limit and leaves the stamp unchanged.
//
// (An earlier revision made this crank fully permissionless and relied on a "real
// progress" diff to stop churn. The diff never bounded anything — one lovelace of
// progress satisfied it — so authority plus this cadence limit replaced it. See
// `lib/stt/settlement_handlers.ak::crank_authority_and_cooldown_ok`.)

/// Minimum gap, in POSIX milliseconds, between cadence-limited streaming
/// actions: a non-admin payout or receiver cancellation (30 minutes).
/// Hardcoded, global per wallet, not per payment.
pub const non_admin_payout_cooldown_ms: Int = 1_800_000

/// Maximum validity-window width, in POSIX milliseconds, for a cadence-limited
/// non-admin payout or receiver cancellation (1 hour). The action stamps
/// `last_non_admin_payout_at` with the tx UPPER bound, so without an upper
/// limit on how far that bound can sit beyond the LOWER bound, one action with a
/// distant `invalid_hereafter` could stamp years into the future and freeze every
/// later cadence-limited action. Capping `tx_latest - tx_earliest` pins
/// the stamp to at most `now + 1h`. Enforced only on the non-admin (stamping)
/// payout branch and every receiver-cancel branch — an ADMIN payout does not
/// stamp, so it is not capped. See the whitepaper's Settlement-cadence theorem.
pub const max_payout_validity_window_ms: Int = 3_600_000
