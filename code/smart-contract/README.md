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
bodies, split by audit concern: `action_checks`, `io`, `preservation`, and the
per-authority-family `operator_handlers` / `user_handlers` /
`settlement_handlers`), `lib/state`, `lib/streaming_payments`, `lib/wallet` (also
split by concern: `rules` — the spend-authorization dispatcher; `io` — the
forwarded-STT decode and wallet value snapshot; `stake_pinning` — where may
continuing wallet funds be re-homed; `payout_routing`
— "can value leak?"; `beneficiary_share` — "how much can a beneficiary take?"),
`lib/assets`, and `lib/time`. Shared constants are in `lib/constants.ak`. Test
helpers are in `lib/test_support/`.

## Audit-Oriented Structure

The on-chain model is grouped around the contract's audit boundaries:

- `State` (the STT datum directly — no wrapper)
  - `access`: users, multisig threshold, beneficiaries
  - `proof_of_life`: unlock time and increment
  - `streaming_payments`: recurring payout schedules
  - `wallet_name`: optional human label
  - `intended_stake_credential`: `Option<Credential>` every continuing wallet
    output must carry (`None` = enterprise address); changed only via the
    admin/multisig `SetIntendedStakeCredential` operator action. See the
    whitepaper's *Pinning the stake credential* section.
  - `last_non_admin_payout_at`: `Option<POSIXTime>` recording the upper bound
    of the most recent cadence-limited streaming action (`None` before any).
    Despite its legacy name, both a non-admin `PayStreamingPayment` crank and a
    payee `CancelStreamingPayment` stamp it. They share a 30-minute global
    cooldown and a one-hour validity-window cap. See the whitepaper's
    *Streaming payments and open settlement* section and its *Settlement
    cadence* theorem.

`StreamingPayment` remains an eight-field constructor. Payee cancellation is
represented only by a smaller `end_date`; there is no persistent cancellation
flag or timestamp. Fresh schedules must have `paid_out_amount == 0` and
`start_date < end_date`. A pre-start payee cancellation may create the sole
zero-duration form (`start_date == end_date`); it owes and reserves zero and the
next payout removes it.

Every verification-key or script credential hash stored in State is checked at
its ingress path against Cardano's exact 28-byte Blake2b-224 width. Mint and
`UpdateState` validate access keys, payout-address credentials, and the intended
stake credential; post-mint streaming additions and the dedicated stake setter
apply the same check. Pointer stake addresses are rejected at State ingress:
new pointer addresses are unavailable in the deployed Conway-era protocol, so
a payout address must be enterprise or carry an inline 28-byte stake credential.
Asset identifiers stored in allowances or streaming payments are checked at the
same ingress paths: ADA is only `(empty policy, empty name)`; a native policy id
is exactly 28 bytes and its asset name is at most 32 bytes (including empty).

- `SttAction` (the STT spend redeemer; carries the wallet-side payload directly)
  - `RunOperator(OperatorAction)`
  - `RenewProofOfLife`
  - `UseAllowance(spent_allowance)`
  - `UseBeneficiary(beneficiary_id)`
  - `PayStreamingPayment(payout_delta)`
  - `Consolidate(consolidate_path)`
  - `CancelStreamingPayment(streaming_payment_id)`

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
| `RunOperator { path, kind: Use }` | admin or multisig from `path` | only proof-of-life unlock time may move forward | operator may spend wallet (rule trivially passes) |
| `RunOperator { path, kind: UpdateState }` | admin or multisig from `path` | access + proof-of-life settings may change, streaming payments must be forwarded | no wallet spend |
| `RunOperator { path, kind: ManageStreamingPayments }` | admin or multisig from `path` | existing streaming payments may be rescheduled (end date up to extend, or down no earlier than the tx upper bound to stop accrual) or new unsettled payments may be added; existing entries are never dropped or otherwise changed; proof-of-life unlock time may renew, access unchanged | no wallet spend |
| `RunOperator { path, kind: RemoveAccessIndex(target) }` | admin or multisig from `path` | exactly the user/beneficiary entry at the targeted index is removed; recovery reachability re-checked; everything else unchanged | no wallet spend |
| `RunOperator { path, kind: SetIntendedStakeCredential(target) }` | admin or multisig from `path` | only `intended_stake_credential` changes, to `target` | no wallet spend |
| `RenewProofOfLife` | signed non-admin user with renewal rights | only proof-of-life unlock time may renew in-range | no wallet spend |
| `UseAllowance(spent)` | changed allowance user signature | matched user allowance changes, proof-of-life unlock time may renew, threshold/beneficiaries/streaming payments unchanged | wallet payout must equal declared `spent` |
| `UseBeneficiary(id)` | exactly one unlocked beneficiary signature | acting beneficiary removed from state (one-shot); nothing else changes | wallet payout ≤ beneficiary's weighted share `weight / Σweights × (wallet − streaming reserve)`, per asset |
| `PayStreamingPayment(delta)` | a stakeholder signature — admin, multisig quorum, ANY listed user, ANY stream payee, or an unlocked beneficiary. Rate-limited: ≥30 min since the last cadence-limited payout or payee cancel, unless an ADMIN signs | streaming payment payout progress changes; a non-admin crank stamps `last_non_admin_payout_at` to the tx upper bound (an admin crank must leave it unchanged) | wallet payout must equal `delta` and reach tagged streaming payment outputs; exempt from the streaming-reserve floor (its outflow is already pinned to the tagged payees) |
| `Consolidate(path)` | admin, multisig, or beneficiary path | no state change | wallet input value == wallet output value |
| `CancelStreamingPayment(id)` | the target payment's payee signature (its `payout_address` payment key; a script payee cannot sign — operators stop such a stream via `ManageStreamingPayments`) | the target's `end_date` strictly decreases but stays at or after the tx upper bound (and never before its start); the action stamps `last_non_admin_payout_at` and shares its 30-minute cooldown and one-hour window cap; everything else unchanged | no wallet spend |

[INTERACTIONS.md](INTERACTIONS.md) draws this table as diagrams (actor →
action → wallet effect, plus the co-firing handshake) and carries a manual
audit checklist for every path — start there when reviewing a new action.

The validator code follows this table directly:

- `validators/stt.ak` dispatches the spend redeemer to per-action `eval_*`
  handlers in `lib/stt/{operator,user,settlement}_handlers.ak`, grouped by
  authority family.
- `validators/wallet.ak` builds the wallet value snapshot once
  (`lib/wallet/io.ak::collect_wallet_value_snapshot`) and delegates wallet-rule
  checks to `lib/wallet/rules.ak::stt_action_allows_spend`.

The same `stt` script is also the minting policy, so the frontend only
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
  `unlock_time`: `expect_valid_renewal_window` passes trivially when `unlock_time`
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
  See `eval_operator_use` in `lib/stt/operator_handlers.ak`.
- **Wallet outputs are pinned to the State's intended stake credential.** Because
  receiving is unrestricted, anyone may deposit to the wallet's *payment*
  credential under any *stake* credential (a "Frankenstein" address). Such funds
  stay locked by the wallet script — they cannot be stolen — but their staking
  rewards, delegation, and governance vote would otherwise fall to the foreign
  stake credential, and address-based balance queries would miss them. The wallet
  validator therefore requires every continuing wallet output to carry
  `State.intended_stake_credential`, so no spend (including a
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

### Toolchain

The compiler version is pinned in [aiken.toml](aiken.toml) (`compiler = "v1.1.23"`)
and every CI workflow installs exactly that version. A different compiler produces
different validator hashes — and the hash *is* the on-chain contract address — as
well as potentially different formatter output. Install and switch with:

```sh
aikup install v1.1.23
```

`pnpm preflight` (run automatically by `pnpm verify` and `pnpm sync`) fails fast
when the local `aiken` doesn't match the pin.

### Everyday commands

The `package.json` scripts mirror the CI gates, so a clean local run means a
clean CI run:

| Command | What it does |
| --- | --- |
| `pnpm check` | `aiken check -D` — type-check + full test suite, warnings are errors (the CI gate) |
| `pnpm test <pattern>` | **the inner-loop command** — only the tests matching `<pattern>` (`aiken check -D -m`). `pnpm test allowance` is sub-second against ~30s for the full suite. Matches a module (`stt_allowance_tests`) or a single test (`"stt_allowance_tests.{allowance_use_accepts_exact_single_user_spend}"`) |
| `pnpm test:watch <pattern>` | same, re-run on every file change |
| `pnpm watch` | the **whole** suite on every file change |
| `pnpm fmt` | format the tree with the pinned formatter |
| `pnpm fuzz` | property tests at `--max-success 10000` (the PR fuzz gate) |
| `pnpm verify` | everything CI checks: toolchain pin, banned-vocabulary gate (`scripts/check-vocabulary.mjs`, CLAUDE.md §6), trace-coverage gate, `aiken fmt --check`, `aiken check -D`, the execution-cost gate, and the off-chain test suite |
| `pnpm docs` | generate the searchable HTML API reference from the `///` doc comments (`aiken docs`) |
| `pnpm sync` | `aiken build` + mirror `plutus.json` into the dApp (`sync:blueprint`) |
| `pnpm build:debug` | build with `--trace-level verbose` into `plutus-debug.json` (gitignored). Use when a transaction fails on preprod: the deployed blueprint erases all traces, so a rejection there tells you nothing — deploy this build instead and the failing conjunct is named |
| `pnpm check:summary` | run `aiken check -D` and print the "N checks, 0 errors, 0 warnings" line for commit messages (rule 8 in [CLAUDE.md](CLAUDE.md)) |
| `pnpm traces` | trace-coverage gate for CLAUDE.md §9 (below) |
| `pnpm budgets` / `pnpm budgets:update` | execution-cost gate (below) |
| `pnpm offchain:test` | the `offchain/` test suite plus a parse check of every example |
| `pnpm devnet:up` / `:down` / `:status` | local Cardano devnet for the off-chain scripts (below) |

#### Execution-cost gate

`aiken check` measures `mem`/`cpu` for every unit test and `plutus.json` records
every compiled script size; both were being discarded. `pnpm budgets` snapshots
them into [budgets.json](budgets.json) and fails when they move by more than 1%.
It is a snapshot test, not a threshold — a unit test's cost is a deterministic
evaluation, so drift is a real change: read the reported deltas, and if they are
intended re-record with `pnpm budgets:update` and say why in the commit message.
It also surfaces the number that matters most for a growing validator: the
largest compiled script against the 16 KiB limit (currently ~12.6 KiB).

Refactoring test fixtures moves these numbers too (the scaffolding is evaluated
as part of the test), so a fixture change legitimately ends in a `budgets:update`
commit.

#### Trace-coverage gate

`pnpm traces` enforces CLAUDE.md §9 mechanically: every conjunct of an
`and { … }` whose `False` means rejection must carry `?`. `or { … }` path
selectors are skipped, as are `expect_*` helpers (they trace from inside), test
blocks, and any block carrying an explicit `§9` note explaining why it is a scan
predicate. Previously the rule existed only in prose and a missed `?` stayed
invisible until someone was debugging a rejection.

On push, CI covers the same ground: the
[blueprint-autosync workflow](../../.github/workflows/blueprint-autosync.yml)
rebuilds the blueprint and mirrors it into the frontend whenever contract sources
change, `smart-contract-ci.yml` runs `aiken fmt --check` and `aiken check -D`,
and PRs into dev/main additionally run the `--max-success 10000` fuzz pass
(`smart-contract-fuzz.yml`).

### Offchain examples

`offchain/lib/` holds the shared, side-effect-free plumbing every script needs —
blueprint loading, validator lookup by title, script/address/policy-id
derivation, STT asset-name derivation (`blueprint.mjs`), and provider/network
selection (`network.mjs`). Each script used to inline its own copy, which made
the parts worth testing untestable; `offchain/test/` now asserts them against the
committed `plutus.json` in about a second (`pnpm offchain:test`, also a CI gate).

The asset-name derivation is pinned on **both** sides of the boundary — the same
vector appears in `offchain/test/blueprint.test.mjs` and in
`validators/stt_mint_tests.ak::stt_asset_name_derivation_matches_offchain_vector`
— so an off-chain builder that drifts from
`lib/stt/io.output_reference_to_asset_name` fails a test instead of minting an
STT the validator refuses to spend.

#### Running against a local devnet

The scripts default to preprod via `BLOCKFROST_API_KEY`, which makes every change
a real testnet round-trip with a funded key. Setting `CARDANO_PROVIDER_URL`
instead points them at a local devnet — Yaci DevKit's Yaci Store speaks the
Blockfrost API, so the same scripts run unmodified against a chain that starts in
seconds, produces a block every second, and needs no faucet:

```bash
pnpm devnet:up
```

It prints the `CARDANO_PROVIDER_URL` to export, and serves a block explorer at
`http://localhost:5173` for inspecting a rejected transaction. `pnpm devnet:down`
stops it and discards all chain state. Requires Docker.

The maintained scripts cover bootstrap and funding only:

1. `generate-credentials.mjs` — create and fund the local example key.
2. `mint-stt.mjs` (`pnpm mint`) — mint a fresh STT / wallet; prints the policy id.
3. `fund-wallet-example.mjs` — deposit funds at the wallet spend address.
4. `cleanup-utxo.mjs` — sweep stray example-key UTxOs between runs (anytime).

Use the dApp transaction builders for State updates, co-firing wallet spends,
and streaming payouts. The former standalone lifecycle examples duplicated
State and redeemer encodings, drifted from the production builders, and were
removed rather than kept as unsafe copy-paste references.

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
- Common test helpers live in the `lib/test_support/` modules. The split is by
  audit concern:
  - `state_builders` — State-datum shapes: the `base_*` records, the `with_*`
    mutators, and the named roles/wallets (`admin_user`, `secured_state`, …).
  - `security_fixtures` — transaction/input/output construction, addresses,
    transaction ids (`tx_id`), and the `SttAction` shortcuts.
  - `stt_test_helpers`, `wallet_test_helpers`,
    `streaming_payment_test_helpers`, `fuzz_generators` — per-suite builders.

  Look there first before adding a new constructor or transaction builder.

- **Build State values by record update, never by a positional constructor.**
  Start from a `base_*` record (or a named shape) and name only the fields the
  test puts under attack:

  ```aiken
  // Not: user(0, ["admin"], [], [], 0, False, None, True) — which flag was which?
  state_types.User { ..states.base_user(), user_wallets: ["admin"], is_admin: True }

  states.base_state()
    |> states.with_users([states.admin_user("admin")])
    |> states.with_proof_of_life(100, 50)
  ```

  A test then reads as the list of things it turned on, and adding a field to
  `State`/`User` is a one-line change in `state_builders` instead of an edit at
  every call site.

- Use `fixtures.tx_id(#"1a31")` for transaction ids rather than a 64-character
  hex literal — an accidental duplicate between two tests is then visible at a
  glance.

- To rewrite part of an existing state, prefer the `with_*` mutators over
  rebuilding the nested `AccessControl`: `state_input |> states.with_users([…])`
  preserves the multisig threshold and beneficiaries instead of restating them.
  (A number of older tests still rebuild the record explicitly; those are
  correct as written — prefer the mutator in new and edited tests.)

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
| Weighted-share recovery | exact floor boundary, take never exceeds the pool | `lib/wallet/beneficiary_share.ak` |
| Streaming-payment accrual + reserve | non-negative, exact floor, monotonic in elapsed time; reserve covers accrued-minus-paid, monotone in time | `lib/streaming_payments/funding_tests.ak` |

Conventions:

- Tests for a **public** function go in that module's `tests.ak`.
- Tests for a **private** helper live in a `// Property-based coverage` block at
  the bottom of the module that defines it (so the helper stays private), as in
  `lib/state/allowance.ak` and `lib/wallet/beneficiary_share.ak`.

### Reproducing a fuzz failure

Property tests use a fresh pseudo-random seed on every run, so a failure seen
once (locally or in the CI fuzz pass) is not automatically hit again. Every
`aiken check` run reports its seed — in the failure output on a TTY, and as the
top-level `"seed"` field of the JSON report when output is piped. To replay the
exact failing run, pass that seed back in, along with the iteration count the
failing run used and (optionally) a filter for the failing module or test:

```sh
aiken check --seed <N> --max-success 10000 -m wallet_fuzz_tests
# or a single test:
aiken check --seed <N> --max-success 10000 -m "wallet_fuzz_tests.{prop_name}"
```

When a CI fuzz run fails, grab the seed from the workflow log before retrying
the job — a retry reseeds and may pass without the bug being fixed.

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

The executable [security evidence map](SECURITY.md) links every Security
Analysis invariant and practical threat claim to its regression tests, and maps
every named attack-log test back to the whitepaper. Use it as the reviewer entry
point for the Catalyst abuse-vector evidence.

## Resources

- [Project whitepaper](../../whitepaper/whitepaper.pdf)
- [Security evidence map](SECURITY.md)
- [Interaction map & path audit](INTERACTIONS.md)
- [Aiken user manual](https://aiken-lang.org)
