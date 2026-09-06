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
    of the most recent cadence-limited action (`None` before any).
    Despite its legacy name, a non-admin `PayStreamingPayment` crank, a payee
    `CancelStreamingPayment`, `StopBeneficiaryStream`, final-beneficiary
    recovery or exit, and sole-beneficiary exact distribution stamp it. They
    share a 30-minute global cooldown and a one-hour validity-window cap. See
    the whitepaper's
    *Streaming payments and open settlement* section and its *Settlement
    cadence* theorem.

`Beneficiary` stores five fields: `id`, `beneficiary_wallets`, `unlock_after`,
`weight`, and `payout_address`. The full address can use key or script payment
credentials, with no stake credential or an inline key or script stake credential.
The field stores the encoded `Address` as `Data`, with no extra wrapper. Mint and
`UpdateState` decode and validate the full address. Other paths preserve its encoded
value exactly. This avoids repeated address decoding when the action does not use it.
`DistributeBeneficiaries` casts this field to route exact payouts. `UseBeneficiary` and
`ExitBeneficiary` retain their current payout rules and do not use this destination.
State ingress checks address shape, but it permits a payout payment credential that
matches the wallet or STT script. Exact distribution rejects both credentials, including
stake variants. A beneficiary that will use exact distribution must use another payment
credential. The other beneficiary actions remain available because they do not use this
field.

_VERIFIED:_ `state/configuration.ak::expect_beneficiaries_are_valid` checks address
shape. `wallet/beneficiary_distribution.ak::all_shares_are_paid` rejects both protocol
payment credentials. The matching rejection tests are in
`validators/beneficiary_distribution_tests.ak`.

`StreamingPayment` remains an eight-field constructor. Payee cancellation is
represented only by a smaller `end_date`; there is no persistent cancellation
flag or timestamp. Fresh schedules must have `paid_out_amount == 0` and
`start_date < end_date`. A pre-start payee cancellation may create the sole
zero-duration form (`start_date == end_date`); it owes and reserves zero and the
next payout removes it. A fresh schedule cannot use the STT payment credential,
including an address with a different stake credential. Mint reads that
credential from its runtime policy id. Management reads it from the consumed
STT input and applies the check only to new ids. Existing payout addresses stay
immutable.

_VERIFIED:_ `validators/stt.ak::eval_mint`,
`lib/stt/operator_handlers.ak::eval_manage_streaming_payments`, and
`lib/streaming_payments/forwarding.ak::are_forwarded_rescheduled_or_added`
enforce this without embedding the STT hash as a validator parameter.

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
  - `ExitBeneficiary(beneficiary_id)` (constructor index 7)
  - `StopBeneficiaryStream(beneficiary_id, streaming_payment_id)` (constructor index 8)
  - `DistributeBeneficiaries(beneficiary_id)` (constructor index 9)

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
| `RunOperator { path, kind: Use }` | admin or multisig from `path` | only proof-of-life unlock time may move forward | operator may spend wallet while each active stream's accrued reserve remains funded |
| `RunOperator { path, kind: UpdateState }` | admin or multisig from `path` | access + proof-of-life settings may change, streaming payments must be forwarded | no wallet spend |
| `RunOperator { path, kind: ManageStreamingPayments }` | admin or multisig from `path` | existing streaming payments may be rescheduled (end date up to extend, or down no earlier than the tx upper bound to stop accrual) or new unsettled payments may be added; existing entries are never dropped or otherwise changed; proof-of-life unlock time may renew, access unchanged | no wallet spend |
| `RunOperator { path, kind: RemoveAccessIndex(target) }` | admin or multisig from `path` | exactly the user/beneficiary entry at the targeted index is removed; recovery reachability re-checked; everything else unchanged | no wallet spend |
| `RunOperator { path, kind: SetIntendedStakeCredential(target) }` | admin or multisig from `path` | only `intended_stake_credential` changes, to `target` | no wallet spend |
| `RenewProofOfLife` | signed non-admin user with renewal rights | only proof-of-life unlock time may renew in-range | no wallet spend |
| `UseAllowance(spent)` | changed allowance user signature | matched user allowance changes, proof-of-life unlock time may renew, threshold/beneficiaries/streaming payments unchanged | wallet payout must equal declared `spent` |
| `UseBeneficiary(id)` | exactly one unlocked beneficiary signature | an earlier acting beneficiary is removed; the final beneficiary stays in State and stamps the shared cadence clock; nothing else changes | wallet payout ≤ beneficiary's weighted share `weight / Σweights × (wallet − streaming reserve)`, per asset; final recovery may leave reserve-aware change and repeat after the cooldown. Once its recovery window opens, the sole final beneficiary controls non-admin payout authority. Each payee keeps one exact terminal cancellation per payment |
| `ExitBeneficiary(id)` | exactly one unlocked beneficiary signature | removes the actor, including the final beneficiary. Earlier exits preserve cadence. Final exit requires an empty stream list and stamps the shared clock under the existing 30-minute cooldown and one-hour window cap | the existing per-asset weighted-share and streaming-reserve checks apply. Wallet outputs cannot outnumber consumed wallet inputs |
| `DistributeBeneficiaries(id)` | declared initiating beneficiary signs; every beneficiary is unlocked | empty stream list required; preserves all beneficiaries and State. Multiple beneficiaries preserve cadence; the sole beneficiary advances the existing shared cadence | exactly one wallet input and zero wallet outputs across its payment credential. Every asset divides exactly by weights. Each beneficiary receives one tagged output at its full configured address; native quantities are exact and ADA can exceed the exact share |
| `StopBeneficiaryStream(beneficiary_id, stream_id)` | exactly one unlocked beneficiary signature | changes one stream's end to `max(start_date, tx_upper)`, strictly before its old end. All debt fields and other streams remain unchanged. It stamps the shared 30-minute cadence with no admin bypass | no wallet spend |
| `PayStreamingPayment(delta)` | while the transaction lower bound is before the sole final beneficiary's recovery boundary: an admin, any other listed user, any stream payee, or any unlocked beneficiary. Once that lower bound reaches the boundary: only an admin or that beneficiary | streaming payment payout progress changes; a non-admin crank stamps `last_non_admin_payout_at` to the tx upper bound (an admin crank must leave it unchanged) | wallet payout must equal `delta` and reach tagged streaming payment outputs; exempt from the streaming-reserve floor (its outflow is already pinned to the tagged payees) |
| `Consolidate(path)` | admin, multisig, or beneficiary path | no state change | aggregate wallet value is preserved; wallet UTxOs may be collected or repartitioned |
| `CancelStreamingPayment(id)` | the target payment's payee signature. A script payee cannot sign, so operators stop such a stream via `ManageStreamingPayments` | the target's `end_date` strictly decreases but stays at or after the tx upper bound (and never before its start). After final recovery opens, it must equal that earliest safe cutoff, so each payment can advance the shared clock once. The action stamps `last_non_admin_payout_at` and shares its 30-minute cooldown and one-hour window cap; everything else stays unchanged | no wallet spend |

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
The wallet spend script remains inline by default because it is parameterized
per STT. Consolidation can instead use a configured per-wallet reference UTxO.
The capped-list, 151-policy phase-one fixture uses that reference path.

## Role Model & Trust Boundaries

The contract's authorization model has a few deliberate design choices that
operators and auditors should understand before configuring a wallet. These
are not hidden bypasses — they follow from the product requirements and are
exercised in the suite.

- **Positive-power users must use distinct credentials.** Mint and
  `UpdateState` reject a payment key hash that appears in more than one user
  record with positive multisig power. A signed record contributes its
  configured weight once. Records with no power or zero power may still share
  credentials. Distinct credentials do not prove distinct people because one
  person can control several keys. The frontend applies the same rule before
  transaction construction. See
  `valid_state_configuration_rejects_wallet_shared_by_powered_users`,
  `stt_mint_rejects_shared_multisig_credential`, and
  `operator_state_update_rejects_shared_multisig_credential`.
- **Beneficiary and user wallets may overlap.** The same key can
  simultaneously be a live user identity and a future unlocking beneficiary.
  This is the recovery-path design; state configuration explicitly permits it.
- **Beneficiary withdrawals use weighted shares.** Each beneficiary carries a
  `weight`. On unlock it may withdraw up to
  `weight / (sum of weights of all beneficiaries still present) × (wallet value
  − streaming-payment reserve)` per asset. Every beneficiary before the final
  one is then removed from State, so its withdrawal is one-shot. The remaining
  weights are recalculated after each removal. An earlier beneficiary that takes
  less than its share forfeits the remainder to those acting after it. The final
  beneficiary owns all remaining beneficiary weight and stays in State. It may
  recover value from any wallet-input set that fits the ledger and action limits.
  It may leave continuing wallet outputs when the reserve or a smaller chosen
  withdrawal requires change. Final recovery has no five-native-asset cap. The
  beneficiary can retry with fewer inputs or a smaller draw after the shared
  30-minute cooldown. If a dense input holds a reserved asset, the beneficiary
  can first advance that payment with a minimum `PayStreamingPayment` action.
  It can repeat until each present reserved payment is settled, then recover a selected
  unreserved subset while absent reserve keys impose a zero floor. The final
  beneficiary remains in State throughout this sequence. No transaction can
  prove that another wallet UTxO does not exist or that no future deposit will
  arrive, so the contract has no final recovery marker. This path recovers
  wallet UTxOs only. Staking rewards remain operator-only.
- **Exact distribution retains recovery rights.** Each transaction distributes one selected wallet UTxO to every remaining beneficiary. All quantities, including lovelace, must divide exactly by the remaining weights. Beneficiaries retain their weights and may repeat with another input. Every stream must first leave State through settlement. Fees and any ADA topups come from external funding. This action sets no asset-count cap. Ledger size and execution limits still apply. With two or more beneficiaries, no streams, and every beneficiary unlocked, the named initiator can sign an STT-only call. The call preserves State and cadence, so the initiator can immediately build another call against the recreated STT. Each call consumes and recreates the latest STT. The caller funds its fee, and no wallet value moves. A call can invalidate another pending transaction that references the prior STT. This uncadenced succession is an accepted design trade-off. The sole-beneficiary form remains cadence-limited. It cannot prove wallet exhaustion.
  _VERIFIED:_ `lib/stt/user_handlers.ak::eval_distribute_beneficiaries` and `validators/beneficiary_distribution_tests.ak::authorized_stt_only_transaction_preserves_multiple_beneficiary_state` accept this wallet-less transition.
  _INFERRED:_ Every successor spends the recreated singleton STT, so it conflicts with a pending transaction that references the prior output.
- **Recovery preparation preserves wallet value.** Verified in `settlement_handlers.eval_consolidate` and `wallet/rules.ak`: an unlocked beneficiary can use existing `Consolidate` to merge or split selected wallet UTxOs. State and beneficiary rights stay unchanged. The preparation builder derives one clean pool and its remainder from the selected value. Pool quantities must be multiples of `sum(weights) / gcd(weights)`. An empty pool request merges the selected inputs. Selected wallet ADA must cover each continuing output's minimum ADA; external funding pays fees. A shortage requires ADA reassignment or a separate wallet deposit. Preparation does not guarantee that the later distribution fits ledger limits. See P12 in [INTERACTIONS.md](INTERACTIONS.md) for the runnable native check.
- **Beneficiaries can stop future stream accrual.** `StopBeneficiaryStream` works with key and script payee addresses. It preserves earned debt and does not transfer funds. The existing settlement action remains necessary. Operators keep their existing management authority and can later reschedule a stopped stream.
- **Self-addressed ADA streams are accepted.** Mint and stream addition reject the STT payment credential, but they permit a valid address with the wallet payment credential. When settlement consumes wallet UTxOs, a tagged output at that address also counts as a continuing wallet output. The continuing wallet aggregate must equal the wallet input aggregate minus the validated ADA payout delta. ADA routing permits ADA at every correctly tagged configured stream output and checks only the aggregate tagged ADA amount. The exact wallet outflow can therefore reach another configured stream payee. The validators do not bind individual lovelace from one stream's delta to that stream's address. Total wallet loss remains capped by the validated payout delta. A wallet-less settlement can use external value to create a tagged wallet output because the wallet validator does not run. This behavior is an intentional configuration risk.
  _VERIFIED:_ `stt_mint_tests.stt_mint_accepts_stream_to_wallet_address` and `stt_operator_tests.manage_streaming_payments_accepts_adding_wallet_address_stream` cover configuration. `wallet_spend_tests.streaming_payment_payout_accepts_self_address_delta_at_other_payee` runs both validators with no external input. It sends 5 ADA from the wallet to a 4 ADA tagged wallet continuation and a 1 ADA tagged output for another unchanged stream. `wallet_rule_tests.streaming_payment_payout_rule_accepts_configured_wallet_self_address` covers the wallet rule directly.
  _INFERRED:_ Ledger value conservation can assign part or all of the exact wallet delta to transaction fees when outputs do not consume it.
- **Permanent beneficiary exit is explicit.** `ExitBeneficiary` removes its actor even when it is the final beneficiary access path. It does not prove that all wallet UTxOs were selected. Existing users retain their bounded Allowance rights, and surviving operators retain their existing authority. If neither path remains, remaining funds and future deposits cannot be recovered. Final exit requires no streaming payments. Mint and `UpdateState` still require reachable access.
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
  not constrain destinations or output shape for operator-use paths. It still
  requires each active stream's accrued reserve to remain funded.
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
  Inputs are still aggregated by payment credential. `Consolidate` can re-home
  compatible stray-stake inputs and may collect or repartition wallet UTxOs. Its input
  count, output count, and native-asset shape are limited only by ledger byte-size
  and combined ExUnit limits. Other value-moving actions also have no fixed
  wallet-input count, but their action-specific Value limits still apply. The
  credential changes only through
  the dedicated `SetIntendedStakeCredential` operator action. The reference
  frontend queries by payment credential through Koios and opens the consolidation
  flow for stray-stake UTxOs. See the
  whitepaper's *Pinning the stake credential* section and the frontend's
  [discovery module](../dApp/src/lib/discovery/README.md).

The validators set no global wallet-input, general transaction-input, general
output, ordinary redeemer, or positive payout count. Allowance, beneficiary,
and payout actions still limit their continuing wallet-output count. The
serialized transaction size and combined ExUnits determine which other
transaction shapes fit the ledger limits.

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

`aiken check` measures `mem` and `cpu` for every unit test. `plutus.json`
records each raw compiled script size. `pnpm budgets` snapshots these values in
[budgets.json](budgets.json). It fails when a snapshot moves by more than 1%.
It also groups the named STT and wallet legs from each transaction fixture.
Each named Epora group must stay below the repository ceilings of 14,000,000
memory units and 9,000,000,000 CPU units. These group ceilings do not cover an
arbitrary external validator. A real transaction also spends those execution
units and can fail when its total exceeds the network limit.

**Correction:** the earlier paragraph named an outdated largest-memory group and
stated a 1,024-byte deployment margin. Those figures did not reflect the current
compiled artifacts. The following values come from [budgets.json](budgets.json),
recorded by [check-budgets.mjs](scripts/check-budgets.mjs).

VERIFIED (2026-09-06): `node scripts/check-budgets.mjs --update` recorded
`683 unit tests, 27 transactions, and 11 scripts into budgets.json`.
The optimized scripts change which group has the highest memory cost.
`oversized_value_pay_streaming` now uses 13,372,987 memory units and
4,541,739,905 CPU units. Both are the largest group costs.
It leaves 627,013 memory units, or 4.48%, below the repository ceiling.
`policy_deep_use_allowance` uses 13,156,687 memory units.
`deep_value_pay_streaming` uses 13,321,223 memory units.
The 151-policy under-funded partial recovery uses 12,189,323 memory units.
The 4,999-byte token-wide partial recovery uses 10,016,581 memory units.
Active owner cleanup uses 12,851,517 memory units for the 151-policy shape and
10,674,813 for the token-wide shape.

VERIFIED: [plutus.json](plutus.json) contains 14,428 STT bytes and 9,378 wallet bytes.
These raw `compiledCode` sizes measure the artifacts.
The 16,384-byte limit applies to the full serialized transaction.
[assertSerializedTransactionSizeIsBounded](../dApp/src/lib/mesh/transactions/internals/budget.ts)
checks that limit. [signAndSubmitTx](../dApp/src/lib/mesh/transactions/submit.ts)
applies it to the signed transaction before submission.
REPORTED (prior README): A reference deployment of the previous 15,936-byte
STT script used three funding inputs, one reference output,
one base-address change output, no collateral input, and one payment-key witness.
Its unsigned Conway encoding used 16,262 bytes. Its signed encoding used 16,368
bytes, leaving 16 bytes below the 16,384-byte limit.
That historical measurement has not been repeated for the optimized script.
It does not establish capacity for more inputs or witnesses.
Release checks must also use the target network's current parameters.

The Aiken fixtures model the `Transaction` seen by each validator. They pair
the user, combined-access, wallet, allowance, and stream caps with a minimum useful
action. The payout fixtures
settle one unit and retain all 15 schedules. One uses an asset near the end of a
4,999-byte synthetic wallet Value. One uses the deepest asset in a 151-policy
Value. The recovery fixtures then leave the same shapes while every remaining
reserve key is absent. Together, these fixtures measure both validator bodies
for the minimum settlement and draw operations used by that escape sequence.
Wallet-backed fixtures name both the STT and wallet legs. They do not execute
compiled validator entrypoints or prove full transaction serialization.

The separate entrypoint fixture closes the entrypoint budget gap for one
partial streaming payout. Mesh builds the transaction. Aiken's native
transaction simulator then executes its compiled STT `Spend[0]` and wallet
`Spend[1]` validators. VERIFIED: [manifest.json](fixtures/entrypoint-budget/manifest.json)
records 8,536,020 memory units and 2,834,335,903 CPU units. The fixture reaches the user, combined-access, wallet, allowance, and
stream caps. Its five beneficiaries each carry a full script payment address with
an inline script stake credential. It uses high-width uint64 values and valid
action times. It has
120 native assets and a 16,049-byte unsigned transaction.
The generator requires one crank key shared by funding and collateral. The
size gate reserves 106 bytes for its vkey witness. This shape uses 16,155 bytes
with that witness, below the 16,384-byte ceiling. The earlier 103-byte estimate
used a separate signer process. Mesh enables Conway set encoding, which adds
a three-byte tag. The 250-asset fixture failed construction after script growth.
The first optimization pass reduced the 30-asset transaction to 15,953 bytes.
That fell below this test's unchanged 16,000-byte floor.
The final 120-asset fixture restores the size stress after further script reductions.
It retains every State cap and scalar-width profile.
Its execution costs describe this larger fixture, not the previous 30-asset fixture.
The Mesh evaluator
values only let the fixture builder balance the transaction. They do not
determine the measured result.

The retained Exact integration gate runs with
`node scripts/check-beneficiary-distribution-native.mjs` and is part of `pnpm budgets`.
It builds, signs, and natively evaluates two production-builder scenarios.
Both use five native assets with 32-byte names, full script/stake payout addresses,
one funding input, one collateral input, base-address change, and one payment-key witness.
VERIFIED: `node scripts/check-beneficiary-distribution-native.mjs` recorded the following costs.
Two beneficiaries with an inline wallet script use 11,441 signed bytes,
1,663,406 memory units, and 589,862,715 CPU units. Fifteen beneficiaries with
both reference scripts use 9,925 signed bytes, 7,942,445 memory units, and
3,101,476,079 CPU units. The checker verifies the merged signature and body,
declared execution budgets, actual paired costs, and the signed byte limit.
These fixtures do not establish live UTxO existence, current network parameters,
or capacity for additional inputs, witnesses, and other asset layouts.

The diagnostic Aiken Consolidation fixture uses one 151-policy wallet input,
two continuing wallet outputs, an external funding input, and normal change.
Its named STT and wallet helper bodies use 10,302,829 memory units and
3,212,718,668 CPU units together. These figures leave 26.41% memory margin and
64.30% CPU margin. Helper-body figures are not the escape-path proof.

**Verified:** the compiled-entrypoint Consolidation fixture is the proof for
this representative minimum escape. Mesh builds the exact transaction with one
wallet input, two wallet outputs, ordinary funding and change, collateral, and
two reference inputs. Aiken's native simulator then executes that transaction's
compiled STT `Spend[0]` and wallet `Spend[1]` entrypoints. Together they use
5,495,657 memory units and 1,886,997,271 CPU units. This leaves 8,504,343 memory
units, or 60.75%, and 7,113,002,729 CPU units, or 79.03%.

The exact unsigned transaction is 11,151 bytes. It leaves 5,233 bytes, or
31.94%, below 16,384 bytes. Mesh `Value.toCbor()` measures the 151-policy input
Value at 4,991 bytes. The State datum is 5,510 bytes. It reaches the user,
combined-access, wallet, allowance, and stream caps. It uses five beneficiaries
and high-width uint64 values while keeping action times valid.

This fixture does not claim an exhaustive maximum. Its intended stake
credential is `None`, and its Value has one empty-name asset under each policy.
It does not attest signatures, submission under live protocol parameters,
arbitrary external validators, optional field encodings, or other transaction
and native-asset topologies. The 4,999-byte helper-fixture figure is the result
of `cbor.serialise(Data)` inside Aiken, not the ledger's `maxValSize`
serialization.

Unit test cost is deterministic. Read reported deltas, and record intended
changes with `pnpm budgets:update`. State the reason in the commit message.

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
2. `mint-stt.mjs` (`pnpm mint`): mint a fresh STT / wallet; prints the policy id.
   Set `STT_SPEND_REFERENCE="txHash#index"` in `.env` first. The script checks
   that this exact output is unspent and contains the current STT script.
   It uses that reference because the inline script exceeds the transaction size limit.
   Prepare wallet collateral without a reference script before running the command.
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
4. For the CLI, copy its output reference into `STT_SPEND_REFERENCE` in `.env`.
5. Mint fresh STTs from the rebuilt artifacts.

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
