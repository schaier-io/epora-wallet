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
/// Bounds the ExUnit and tx-size cost of validating and transitioning a wallet:
/// configuration validation is super-linear in the access lists (`list.unique`
/// on ids plus per-record allowance/wallet checks), so an unbounded list could
/// grow a wallet past the per-transaction execution budget and strand it.
/// Enforced at mint and on every `UpdateState` via
/// `state/configuration.expect_valid_state_configuration`, and mirrored
/// off-chain in `state-validation.ts`. The cheap per-entry removal path
/// (`RemoveAccessIndex`) is deliberately exempt so an over-budget wallet can
/// always shrink back under the cap one entry at a time.
pub const max_users: Int = 15

/// Upper bound on the number of `Beneficiary` records a `State` may hold.
///
/// Beneficiary validation is quadratic (id uniqueness plus pairwise wallet
/// distinctness), so it is capped for the same execution-budget reason as
/// `max_users`, and enforced alongside it.
pub const max_beneficiaries: Int = 25

/// Upper bound on the number of `StreamingPayment` records a `State` may hold.
///
/// Enforced in `streaming_payments/shape.is_valid`, which runs over the whole
/// output set at mint and on every `ManageStreamingPayments` (the add/forward
/// path), so the cap bounds the set however it grew.
pub const max_streaming_payments: Int = 25

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
// every attacker-/operator-influenceable collection gets an explicit cap, and
// the worst-case state (every outer cap times every inner cap below) is what
// the budget argument must hold for. Enforced in
// `state/configuration.expect_valid_state_configuration` (mint + `UpdateState`)
// and, for the allowance bundle that the `UseAllowance` path can also grow, in
// `state/allowance.expect_allowance_update`. Mirrored off-chain in
// `state-validation.ts`. See the whitepaper Security Analysis ("Bounded
// execution cost").

/// Upper bound on the number of payment-key wallets one `User` record may list.
pub const max_wallets_per_user: Int = 10

/// Upper bound on the number of payment-key wallets one `Beneficiary` may list.
pub const max_beneficiary_wallets: Int = 10

/// Cardano verification-key and script credential hashes are Blake2b-224.
/// Aiken represents them as `ByteArray`, so every State ingress path must pin
/// the ledger width explicitly instead of trusting the type alias.
pub const credential_hash_bytes: Int = 28

/// Native-asset policy ids are Blake2b-224 script hashes.
pub const policy_id_bytes: Int = 28

/// Cardano native-asset names contain at most 32 bytes (empty is valid).
pub const max_asset_name_bytes: Int = 32

/// Upper bound on the number of `(policy_id, asset_name)` entries one allowance
/// bundle (`per_day_allowance` or `remaining_allowance`) may hold. Capped on
/// BOTH the config path and the `UseAllowance` update path, because a spend can
/// otherwise pad `remaining_allowance` with extra (e.g. zero-quantity) entries.
pub const max_allowance_entries: Int = 10

/// Upper bound on the byte length of the optional human `wallet_name` label.
/// Matches the shipped off-chain limit (`state-wallet-name.ts::MAX_WALLET_NAME_BYTES`).
pub const max_wallet_name_bytes: Int = 32

// ---------------------------------------------------------------------------
// Non-admin streaming-payment crank cadence limit (whitepaper:
// Settlement-cadence theorem).
//
// The `PayStreamingPayment` crank is the widest-authority spend: an admin, a
// multisig quorum, ANY listed user, ANY stream payee, or an unlocked beneficiary
// may submit it. Each of those can therefore consume and re-create the single STT
// thread, contending with the owner's transactions — including a proof-of-life
// renewal, whose stalling could lapse the dead-man-switch. To bound that
// contention, a NON-ADMIN crank must land at least this long after the previous
// non-admin crank: it stamps the State's `last_non_admin_payout_at` with the tx
// UPPER bound, and the next one requires its LOWER bound to be at least this far
// past that stamp. ONLY an admin bypasses the limit, and an admin crank leaves the
// stamp unchanged — so the field tracks exactly the throttled population.
//
// (An earlier revision made this crank fully permissionless and relied on a "real
// progress" diff to stop churn. The diff never bounded anything — one lovelace of
// progress satisfied it — so authority plus this cadence limit replaced it. See
// `lib/stt/settlement_handlers.ak::crank_authority_and_cooldown_ok`.)

/// Minimum gap, in POSIX milliseconds, between two NON-ADMIN
/// `PayStreamingPayment` cranks (30 minutes). Hardcoded, not per-wallet.
pub const non_admin_payout_cooldown_ms: Int = 1_800_000

/// Maximum width, in POSIX milliseconds, of a NON-ADMIN `PayStreamingPayment`
/// tx's validity window (1 hour). A non-admin crank stamps
/// `last_non_admin_payout_at` with the tx UPPER bound, so without an upper
/// limit on how far that bound can sit beyond the LOWER bound, one crank with a
/// distant `invalid_hereafter` could stamp years into the future and freeze every
/// later non-admin crank. Capping `tx_latest - tx_earliest` at this value pins
/// the stamp to at most `now + 1h`. Enforced only on the non-admin (stamping)
/// branch — an ADMIN crank does not stamp, so it is not capped. See the
/// whitepaper's Settlement-cadence theorem.
pub const max_payout_validity_window_ms: Int = 3_600_000
