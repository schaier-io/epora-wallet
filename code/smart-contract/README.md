# Permission-Based Wallet Contracts

This package contains the on-chain validators for the permission-based wallet and
the supporting Aiken libraries they share.

The design they implement — goals, threat model, the two-validator handshake, the
formal model, and the security analysis — is documented in the project
[whitepaper](../../whitepaper/whitepaper.pdf). This README covers the code
layout and the contract-level details a contributor or auditor needs.

## Validator Roles

- `validators/stt.ak`
  Owns both sides of the STT lifecycle:
  - `mint` mints the state-thread token (STT) and validates the initial state datum.
  - `spend` governs every state transition for the STT UTxO and validates the
    chosen `SttAction`. The action's declared payload (e.g. spent allowance,
    payout delta) is checked against the state diff.

- `validators/stt_reference_store.ak`
  Provides a fixed, shared script address for the manually deployed STT reference-script
  UTxO. Its spend path always fails, so the ADA locked there is permanent and the output
  exists only as a canonical place to find the current STT reference script later.

- `validators/wallet.ak`
  Enforces the wallet-side spending rule for the STT action that ran in this
  transaction. It reads the STT spend redeemer from `tx.redeemers` and bounds
  wallet movement against the payload that the STT validator already proved
  consistent with the state diff.

Supporting logic lives in `lib/stt` (the STT validator's per-action decision
bodies, split by audit concern: `action_checks`, `io`, `preservation`,
`spend_handlers`), `lib/state`, `lib/streaming_payments`, `lib/wallet`,
`lib/assets`, and `lib/time`. Shared constants are in `lib/constants.ak`. Test
helpers are in `lib/test_support/`.

## Audit-Oriented Structure

The on-chain model is grouped around the contract's audit boundaries:

- `State` (the STT datum directly — no wrapper)
  - `access`: users, multisig threshold, beneficiaries
  - `proof_of_life`: unlock time and increment
  - `streaming_payments`: recurring payout schedule
  - `wallet_name`: optional human label
  - `intended_stake_credential`: `Option<Credential>` every continuing wallet
    output must carry (`None` = enterprise address); changed only via the
    admin/multisig `SetIntendedStakeCredential` operator action. See the
    whitepaper's *Pinning the stake credential* section.
  - `last_permissionless_payout_at`: `Option<POSIXTime>` recording the upper bound
    of the most recent permissionless `PayStreamingPayment` crank (`None` before
    any). Enforces a 30-minute cooldown between permissionless cranks; changed only
    by the crank itself. See the whitepaper's *Streaming payments and
    permission-less settlement* section and its *Settlement cadence* theorem.
- `SttAction` (the STT spend redeemer; carries the wallet-side payload directly)
  - `RunOperator(OperatorAction)`
  - `RenewProofOfLife`
  - `UseAllowance(spent_allowance)`
  - `UseBeneficiary(beneficiary_id)`
  - `PayStreamingPayment(payout_delta)`
  - `Consolidate(consolidate_path)`

This lets auditors review the state shape, STT-side authorization, and wallet-side
effects as separate concerns instead of following one large flat datum/action model.

## How The Validators Coordinate

The redeemer is the single source of truth across both validators:

1. `stt.spend` validates a state transition using the `SttAction` redeemer.
   It also proves the action's declared payload (e.g. spent allowance, payout
   delta) matches the state diff.
2. `wallet` reads the same redeemer via `tx.redeemers[Spend(stt_ref)]`
   and enforces wallet movement against the declared payload.

Composition: STT proves "declared payload equals true state diff"; wallet
proves "wallet movement bounded by declared payload". Net: wallet movement is
bounded by the true state diff.

## Transition Map

| STT action | Required authority | Allowed state delta | Wallet-side effect |
| --- | --- | --- | --- |
| `RunOperator { path, kind: Use }` | admin or multisig from `path` | only proof-of-live unlock time may move forward | operator may spend wallet (rule trivially passes) |
| `RunOperator { path, kind: UpdateState }` | admin or multisig from `path` | access + proof-of-live settings may change, streaming payments must be forwarded | no wallet spend |
| `RunOperator { path, kind: ManageStreamingPayments }` | admin or multisig from `path` | streaming payments may be rescheduled (end date up to extend, or down to the tx upper bound to stop accrual) or added (born unsettled, set re-validated against the count cap); existing entries are never dropped or otherwise changed; proof-of-live unlock time may renew, access unchanged | no wallet spend |
| `RunOperator { path, kind: RemoveAccessIndex(target) }` | admin or multisig from `path` | exactly the user/beneficiary entry at the targeted index is removed; recovery reachability re-checked; everything else unchanged | no wallet spend |
| `RunOperator { path, kind: SetIntendedStakeCredential(target) }` | admin or multisig from `path` | only `intended_stake_credential` changes, to `target` | no wallet spend |
| `RenewProofOfLife` | signed non-admin user with renewal rights | only proof-of-live unlock time may renew in-range | no wallet spend |
| `UseAllowance(spent)` | changed allowance user signature | matched user allowance changes, proof-of-live unlock time may renew, threshold/beneficiaries/streaming payments unchanged | wallet payout must equal declared `spent` |
| `UseBeneficiary(id)` | exactly one unlocked beneficiary signature | acting beneficiary removed from state (one-shot); nothing else changes | wallet payout ≤ beneficiary's weighted share `weight / Σweights × (wallet − streaming reserve)`, per asset |
| `PayStreamingPayment(delta)` | permissionless, but rate-limited: ≥30 min since the last crank unless an admin, multisig quorum, or unlocked beneficiary co-signs | streaming payment payout progress changes; `last_permissionless_payout_at` is stamped to the tx upper bound | wallet payout must equal `delta` and reach tagged streaming payment outputs |
| `Consolidate(path)` | admin, multisig, or beneficiary path | no state change | wallet input value == wallet output value |

The validator code follows this table directly:

- `validators/stt.ak` dispatches the spend redeemer to per-action helpers
  (`eval_operator_use`, `eval_use_allowance`, etc.) and validates each branch
  inline.
- `validators/wallet.ak` builds the wallet value snapshot once and
  delegates wallet-rule checks to `lib/wallet/rules.ak::stt_action_allows_spend`.

The same merged `stt` script is also the minting policy, so the frontend only
needs one deployed STT reference-script UTxO for the STT-side flows after a
fresh deployment. That shared reference now lives at the dedicated
`stt_reference_store` address instead of being created automatically during mint.
The wallet spend script remains inline for now because it is still parameterized
per STT.

## Role Model & Trust Boundaries

The contract's authorization model has a few deliberate design choices that
operators and auditors should understand before configuring a wallet. These
are not hidden bypasses — they follow from the product requirements and are
exercised in the suite.

- **Shared keys may play multiple multisig roles.** A single payment key hash
  may appear in `user_wallets` across more than one user record. When that
  shared key signs, its multisig power is counted for every record that lists
  it. Duplicate entries are intentional and must be deliberate; they change
  the effective threshold semantics. See "Multi-signature counts power per
  record, not per key" in the whitepaper's *Limitations and Trust Assumptions*,
  and the `security_intentional__multisig_shared_key_counts_each_role_*` tests
  in `validators/security_attack_log_tests.ak`.
- **Beneficiary and user wallets may overlap.** The same key can
  simultaneously be a live user identity and a future unlocking beneficiary.
  This is the recovery-path design; state configuration explicitly permits it.
- **Beneficiary withdrawals are weighted, one-shot shares.** Each beneficiary
  carries a `weight`. On unlock it may withdraw up to
  `weight / (sum of weights of all beneficiaries still present) × (wallet value
  − streaming-payment reserve)` per asset, and is then removed from the state.
  Because the weight is retired on use, the shares of any subset of
  beneficiaries always sum to the whole distributable pool regardless of
  withdrawal order, and a beneficiary cannot withdraw twice. A beneficiary that
  withdraws less than its share forfeits the remainder to those acting after
  it. A sole beneficiary (or the last to act) can sweep the entire pool — that
  is the intended full non-admin recovery path.
- **A multisig meeting threshold can rewrite access, including evicting the
  admin.** `RunOperator({ path: Multisig, kind: UpdateState })` may replace the
  entire access-control record — adding or removing users and beneficiaries and
  changing the threshold — as long as the result still passes configuration
  validation (a reachable non-admin path must remain). This means a multisig at
  threshold is a co-equal authority that can override or remove a lost or
  compromised admin key; it is an intentional recovery capability, not a bypass.
  If a deployment needs the admin to be non-removable by multisig, restrict
  admin-set changes to admin-authorized `UpdateState`.
- **Admins can take any action once authorized.** The wallet validator does
  not constrain destinations, amounts, or output shape for operator-use paths.
  The governance wrappers (`withdraw`, `publish`, `vote` in
  `validators/wallet.ak`) likewise only verify that the STT ran with
  a matching `RunOperator({ path, kind: Use })` action; they do not inspect `account`,
  `certificate`, or `voter` payloads. The trust surface for those paths is
  the STT authorization gate and off-chain transaction construction, not
  wallet-side payload validation.
- **Operator `Use` does not force a proof-of-life renewal (off-chain owns
  liveness).** `RunOperator({ path, kind: Use })` may spend without advancing
  `unlock_time`: `has_valid_renewal_window` passes trivially when `unlock_time`
  is unchanged, and a state with no proof-of-life configured is still operable.
  The on-chain validator therefore does *not* guarantee that an actively-used
  wallet stays "alive" — so if the dead-man-switch is configured and the
  operators keep spending without renewing, `unlock_time` can still lapse and a
  beneficiary may unlock a wallet whose operators are in fact active. Keeping the
  wallet alive is the **off-chain builder's responsibility**: it must renew
  `unlock_time` (within the `increment` window) on operator actions whenever
  proof-of-life is configured. The frontend surfaces this as the proof-of-life
  refresh on the send and refresh-timer flows (`showProofOfLifeOverride`). This
  is a deliberate choice (forcing renewal on-chain was considered and declined to
  keep `Use` usable on proof-of-life-less and degenerate `increment = 0` states);
  auditors should treat the builder's renewal logic as part of the trust surface.
  See `eval_operator_use` in `validators/stt.ak`.
- **Wallet outputs are pinned to the State's intended stake credential.** Because
  receiving is unrestricted, anyone may deposit to the wallet's *payment*
  credential under any *stake* credential (a "Frankenstein" address). Such funds
  stay locked by the wallet script — they cannot be stolen — but their staking
  rewards, delegation, and governance vote would otherwise fall to the foreign
  stake credential, and address-based balance queries would miss them. The wallet
  validator therefore requires every continuing wallet output to carry
  `State.intended_stake_credential`, so no spend (including the permissionless
  `PayStreamingPayment` crank) can re-home funds to a foreign stake credential.
  Inputs are still aggregated by payment credential, so stray-stake funds can be
  swept back via `Consolidate`. The credential is changed only by an admin or
  multisig quorum via the dedicated `SetIntendedStakeCredential` operator action.
  The reference frontend adds a diagnostic that queries by payment credential
  (via Koios), flags any stray-stake UTxOs, and offers to sweep them. See the
  whitepaper's *Pinning the stake credential* section and the frontend's
  [discovery module](../dApp/src/lib/discovery/README.md).

Narrowing any of these is a product decision, not a security fix. The
whitepaper's *Limitations and Trust Assumptions* section carries the full
discussion from the user's perspective.

## Local Workflow

Use this loop when changing validators or shared libraries:

```sh
aiken check
```

This runs the unit tests across `validators` and `lib`.

When you want refreshed compiled scripts:

```sh
aiken build
```

This updates `plutus.json`, which is the blueprint used by the local scripts in
this package.

If the frontend should consume the refreshed blueprint too:

```sh
cd ../dApp
pnpm run sync:blueprint
```

On push, CI does this for you: the
[blueprint-autosync workflow](../../.github/workflows/blueprint-autosync.yml)
rebuilds the blueprint and mirrors it into the frontend whenever contract sources
change. Keep in mind that any source change produces a new validator hash — and
that hash *is* the on-chain contract address. CI also runs `aiken fmt --check`
and `aiken check -D` on every push (`smart-contract-ci.yml`), plus a heavier
property-fuzz pass with `--max-success 10000` (`smart-contract-fuzz.yml`).

If you are setting up a fresh deployment after rebuilding the contracts:

1. Build the new blueprint.
2. Open the frontend route `/user`.
3. Create the shared STT reference-script UTxO from the wallet-home setup prompt.
4. Mint fresh STTs from the rebuilt artifacts.

## Test Guidance

- Put validator-specific behavior tests close to the validator modules or in the
  existing validator test modules.
- Prefer test names that describe the contract rule being enforced, not just the
  helper being called.
- When refactoring internals, keep datum types, redeemer types, validator names,
  and `SttAction` payload semantics stable unless the change is explicitly
  intended to alter the contract interface.
- Common test helpers live in `lib/test_support/security_fixtures.ak`. Look
  there first before adding a new constructor or transaction builder.

### Property-based tests

The boundary- and rounding-sensitive arithmetic is covered by `aiken/fuzz`
property tests (named `prop_*`) in addition to the concrete-case tests. They
assert an invariant holds across random inputs rather than at a few hand-picked
points. Current coverage:

| Primitive | Property tests | Location |
| --- | --- | --- |
| Asset entries / value math | well-formedness, per-key value, paid-out delta | `lib/assets/assets_tests.ak` |
| Weighted multisig threshold | met up to total power, predicate monotonicity, empty/non-positive threshold rejected | `lib/state/state_tests.ak` |
| Proof-of-life windows | unlock boundary, renewal within one increment, ceiling enforced | `lib/state/state_tests.ak` |
| Allowance reset | one-period forward progress, reset only at/after deadline | `lib/state/allowance.ak` |
| Weighted-share recovery | exact floor boundary, take never exceeds the pool | `lib/wallet/rules.ak` |
| Streaming-payment accrual | non-negative, exact floor, monotonic in elapsed time | `lib/streaming_payments/streaming_payments_tests.ak` |

Conventions:

- Tests for a **public** function go in that module's `tests.ak`.
- Tests for a **private** helper live in a `// Property-based coverage` block at
  the bottom of the module that defines it (so the helper stays private), as in
  `lib/state/allowance.ak` and `lib/wallet/rules.ak`.

## Security documentation

The security design lives in the project
[whitepaper](../../whitepaper/whitepaper.pdf), which consolidated the earlier
in-repo design notes and ADRs. The sections most relevant to this package:

- *Security Analysis* — each protocol asset, the invariant defended for it, and
  how the validators enforce it. Every invariant is backed by a regression test
  in this suite that reproduces the attack (start at
  `validators/security_attack_log_tests.ak`).
- *Formal Model* — the state space, transitions, and invariants as theorems with
  proof sketches; the definitions mirror the Aiken types and on-chain checks
  here.
- *Limitations and Trust Assumptions* — the intentional trade-offs listed under
  "Role Model & Trust Boundaries" above, stated from the user's perspective.

## Resources

- [Project whitepaper](../../whitepaper/whitepaper.pdf)
- [Aiken user manual](https://aiken-lang.org)
