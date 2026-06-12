# Contract Engineering Rules (AI must follow)

Rules distilled from the tech-debt remediation history (phase 1/2 clarity refactors,
the `stt.ak` split, the dedupe-consensus-math pass, the wrapper collapse, and the
dead-tooling/vocabulary cleanups). Their purpose is to stop the same debt from
re-accruing. Read alongside [README.md](README.md) (validator roles) and the
**whitepaper** — source [whitepaper.tex](../../whitepaper/whitepaper.tex),
rendered [whitepaper.pdf](../../whitepaper/whitepaper.pdf) — the canonical
design and security document. In the whitepaper: "Limitations and Trust
Assumptions" records the intentional trade-offs; "Security Analysis" and the
"Formal Model" (its theorems and Invariants subsection) record the invariants.
The canonical contract vocabulary is inlined in §6 below.

> The former `CONTEXT.md` and the `docs/` tree (ADRs 0001–0009, security-audit /
> threat-model / gap-analysis / hardening-backlog docs) were deliberately deleted
> in the 2026-06 slimming pass and folded into the whitepaper. Do not cite those
> paths and do not re-create them.

## 1. Validators stay thin; decision logic lives in `lib/`

- A `validators/*.ak` file orchestrates: read inputs, dispatch on the `SttAction`,
  call into `lib/` for the actual checks. It does **not** hold the math/predicate
  bodies. (`stt.ak` went 1308 → ~160 lines by moving logic into
  `lib/stt/{action_checks,io,preservation,spend_handlers}.ak` — the per-action
  `eval_*` decision bodies live in `spend_handlers`, the validator only dispatches;
  keep it that way.)
- When a `.ak` file passes ~500 lines **or** mixes more than one audit concern,
  split it **by concern** (io / preservation / action-checks / value), not by
  arbitrary line count. The grouping must map to an audit boundary.
- **Hard cap: 750 lines per file** (excludes `*_tests.ak` and generated
  `plutus.json`). This is repo-wide — see the root [CLAUDE.md](../../CLAUDE.md).
  ~500 is the soft "split by concern" signal; 750 is the ceiling you must not cross.

## 2. Tests never live in logic files

- Every test belongs in a dedicated file whose name ends `_tests.ak`. No `test`
  blocks inside `validators/stt.ak`, `lib/**`, etc.
- Naming is uniform: `<area>_tests.ak` (e.g. `remove_access_index_tests.ak`,
  `security_attack_log_tests.ak`). Never ship a `*_tests.ak`-shaped concept under a
  bare name, and never name a test file after a removed concept — rename when the
  domain term changes.
- Shared test scaffolding goes in `lib/test_support/` (`*_test_helpers.ak`,
  `security_fixtures.ak`), not copy-pasted per test file.
- **Narrow exception — co-locate ONLY when a test needs module-private access.**
  A `test` block MAY stay in a logic/validator file when, and only when, it
  exercises a definition not reachable from a sibling `_tests.ak` module without
  weakening the production code — i.e. a *private* (`fn`, non-`pub`) helper, or a
  validator's own handler that has no extracted `pub` body. The point is to keep
  the tested definition and the production definition as one unit (so a
  boundary-sensitive clamp cannot silently drift) WITHOUT widening the audited API
  surface by making a helper `pub` purely for a test. Such tests must be `prop_*`
  property tests or a single focused unit/`fail` regression, and the target must
  stay private. Anything testable through a `pub` function (e.g. the `eval_*`
  bodies in `validators/stt.ak` / `wallet.ak`) still belongs in a `<area>_tests.ak`
  sibling — never widen visibility just to relocate a test. Sanctioned sites:
  `lib/state/allowance.ak` (allowance-reset arithmetic),
  `lib/wallet/rules.ak` (weighted-share clamp),
  `lib/state/authorization.ak` (`has_beneficiary_unlock_authority`),
  `validators/stt_reference_store.ak` (always-fail guard). A new site needs the
  same "cannot test without going `pub`" justification stated in the diff.

## 3. Safety math has exactly one definition

This is the highest-value rule — duplicated consensus math is a latent vulnerability,
not a style nit.

- The same fold/quantifier over security-relevant state (weighted multisig
  power-sum, streaming-payment reserve, payout-tag decode, allowance draw-down)
  must have **one** audited definition, owned by the `lib/` module that owns the
  type. Inject the differing intent as a lambda rather than copying the body.
  - Precedent: `configuration.sum_multisig_power` / `multisig_threshold_is_met`
    feed both the spend-time "did this user sign?" and config-time "can this user
    sign?" callers. `streaming_payments/types.output_payout_tag` is the single
    payout-tag decoder for both the wallet leak check and the payout matcher.
- Before writing a `when … is InlineDatum -> if … is OutputId`-style ladder or a
  `multi_sig_power` fold, grep for an existing helper. If one exists, route through
  it. If two sites already diverge, unify them.

## 4. No pure-forwarding wrappers

- Do not add a function that only forwards arguments to another function. Call the
  real thing. (Pure-forwarding multisig wrappers were collapsed for exactly this —
  they add an indirection an auditor must chase with zero behavioral value.)

## 5. No dead code, scratch probes, or stale tooling

- Never commit scratch/exploration files (e.g. a `scratch_deadlock_probe`). Delete
  experiments before committing.
- Off-chain example/helper scripts (`offchain/*.mjs`) must validate under the
  **current** contract model. If a flow cannot validate (e.g. a close/burn flow
  under the immortal-STT model; historically an `add_subscription` script died
  this way back when streaming payments were still fixed at mint), delete the
  script — do not leave it as misleading reference.

## 6. Canonical vocabulary only — no legacy aliases

The table below is the canonical contract vocabulary (formerly the `CONTEXT.md`
glossary's `_Avoid_:` lines, preserved here verbatim since that file is gone).
Use the canonical terms exactly; the banned words are forbidden in new code,
identifiers, comments, and docs.

| Canonical term | Banned alternatives |
| --- | --- |
| STT (State Thread Token) | NFT, state token, thread token, beacon |
| State (the STT datum) | datum, config, settings |
| Intended stake credential | delegation, reward address, Franken address (that is the attack, not the field) |
| SttAction | redeemer, command, WalletWitness (a removed predecessor) |
| STT validator (`stt.ak`) | minting policy (it is both mint and spend) |
| Wallet validator (`wallet.ak`) | spend validator, payment validator |
| STT reference store | vault, deposit script |
| User | account, member, owner/spender/keeper (product-surface projections) |
| Beneficiary | heir, recipient, payee (Payee is the streaming-payment word) |
| Allowance | limit, budget, quota |
| Operator | signer (too generic), owner (product-surface word) |
| Admin | root, superuser, owner |
| Multisig | m-of-n (power is weighted, not a flat count) |
| Streaming-payment reserve | subscription reserve, floor, minimum balance |
| Recovery reachability | anti-brick (informal), liveness (that is Proof-of-life) |
| Proof-of-life | proof-of-live (the old code spelling), heartbeat (the renewal act, not the state) |
| Dead-man-switch | — not a distinct mechanism; it *is* Proof-of-life |
| Renewal | heartbeat, keep-alive, ping |
| Increment | interval, period |
| Liveness keeper | watcher, pinger |
| Streaming payment | subscription (the removed code term), recurring charge, vesting |
| Payee | recipient, beneficiary (Beneficiary is the recovery role) |
| Payout tag | marker, label |
| Crank | trigger, claim, pull |
| Use (`RunOperator(.., Use)`) | spend, operate |
| Update state (`RunOperator(.., UpdateState)`) | configure, edit |
| Manage streaming payments (`ManageStreamingPayments`) | manage subscriptions (this path adds new streaming payments and forwards/reschedules existing ones; it cannot delete an existing one — an operator stops a payment by rescheduling its end date down) |
| Set intended stake credential (`SetIntendedStakeCredential`) | delegate (the staking act), set stake, UpdateState (a different, broader path) |
| Renew (`RenewProofOfLife`) | ping, keep-alive |
| Use allowance (`UseAllowance`) | spend, withdraw |
| Use beneficiary (`UseBeneficiary`) | claim, inherit |
| Pay streaming payment (`PayStreamingPayment`) | pay subscription |
| Consolidation (`Consolidate`) | merge, sweep, compaction |

- The product surface deliberately speaks plain English instead — *owner*,
  *spender*, *keeper*, "backup person" (Beneficiary), "daily spending limit"
  (Allowance), "wake-up timer" (Proof-of-life), "scheduled payment" (Streaming
  payment). Those are intentional UI translations, allowed in frontend copy only —
  never in contract code, identifiers, or comments.
- Banned legacy spellings/terms that must never reappear: `proof_of_live`
  (→ `proof_of_life`), `subscription`/`Subscription`/`PaySubscription`
  (→ `streaming_payment` / `StreamingPayment` / `PayStreamingPayment`),
  `WalletWitness`, and `NFT`/`beacon`/`state token` for the STT.
- When renaming a domain term, rename across **contracts + blueprint + frontend in
  one pass** and retain **no** alias (`aiken build` → `pnpm sync:blueprint`
  regenerates `plutus.json` into the frontend).

## 7. The whitepaper is the decision record — keep it in lockstep with the code

- The `docs/adr/` convention is **retired**. Record new design/security decisions
  in the whitepaper ([whitepaper.tex](../../whitepaper/whitepaper.tex)), in the
  section that owns the concern: "Limitations and Trust Assumptions" for
  intentional trade-offs, "Security Analysis" / "Formal Model" for invariants and
  their enforcement. Rebuild the PDF after editing (Tectonic — see
  [whitepaper/README.md](../../whitepaper/README.md)).
- Reference whitepaper sections/theorems **by name** from code comments (e.g.
  "see the Settlement-cadence theorem"), never by `docs/` path or ADR number.
  Legacy ADR numbers still cited in code comments map to whitepaper homes — when
  touching such a comment, swap the number for the section name:
  - ADR-0004 (recovery reachability) → "Recovery reachability" theorem (Formal
    Model) + the Security Analysis item of the same name.
  - ADR-0006 (access-list caps, growth-cost ordering) → Security Analysis
    "Bounded execution cost".
  - ADR-0008 (validator co-firing containment) → Formal Model "The two
    validators" + "Bounded movement" theorem.
  - ADR-0009 (permissionless-crank cooldown) → "Settlement cadence" theorem
    (Formal Model) + the Security Analysis item of the same name.
- When a design changes, update the whitepaper section describing the old design
  **in the same commit** (a removed handshake once left a stale
  `validator-path-analysis.md` — do not repeat that). Stale design docs are worse
  than none.
- Any intentional-but-surprising behavior must be documented at **both** the code
  site and the whitepaper's "Limitations and Trust Assumptions" section, so it
  never reads as a bug. Current set to preserve: advisory Proof-of-life on
  operator `Use` (the section's caveat box), the immortal STT ("Permanent state
  thread"), and the point-in-time per-asset Streaming-payment reserve ("Streaming
  reserve is point-in-time").
- Magic numbers and caps (access-list caps, growth-cost ordering — see Security
  Analysis "Bounded execution cost") live in `lib/constants.ak`, never inlined at
  the use site.

## 8. Refactors prove they are behavior-preserving

- A change labeled tech-debt / DX / clarity must not alter on-chain behavior. Prove
  it: run `aiken check` and state in the commit message that the check **count is
  unchanged** with **0 warnings** (e.g. "132 checks, 0 errors, 0 warnings —
  unchanged"). A changed count means behavior moved — separate that into its own
  commit with its own justification.
