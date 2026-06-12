# Milestone 2 — Smart Contract Development

The on-chain validators, built from the whitepaper, plus the tests and docs backing the claim that funds are safe.

References: [Whitepaper](../whitepaper/whitepaper.pdf) · [README](../code/smart-contract/README.md)

## Development tasks

### Architecture (§4)

- [x] [`State` datum threaded by the STT](subtasks/m2-arch-01-state-thread.md) — whole config in one object (features-as-config, §4.1).
- [x] [STT mint](subtasks/m2-arch-01-state-thread.md) — unique token; exactly one forwarded per spend (§4.2).
- [x] [Two-validator handshake](subtasks/m2-arch-02-handshake.md) — STT proves declared action = state change; wallet bounds movement ≤ action (§4.2).
- [x] [Stake-credential pinning](subtasks/m2-arch-03-stake-pinning.md) — continuing outputs pinned to the intended credential (§4.5).
- [x] [Always-fail reference store for the STT script](subtasks/m2-arch-04-reference-store.md).

### Transitions (§5, Table 2)

- [x] [Operator use / update state](subtasks/m2-trans-01-operator.md) — admin or weighted-multisig authority (§5.1).
- [x] [Use allowance](subtasks/m2-trans-02-allowance.md) — per-day cap; reset anchored to tx bounds so it can't be forged (§5.1).
- [x] [Renew proof-of-life](subtasks/m2-trans-03-proof-of-life.md) — deadline advances by at most one increment (§5.2).
- [x] [Use beneficiary](subtasks/m2-trans-04-beneficiary.md) — weighted-share withdrawal after lapse; actor removed in the same tx (§5.3).
- [x] [Manage + pay streaming payment](subtasks/m2-trans-05-streaming.md) — accrual, per-asset reserve, permissionless crank into tagged outputs (§5.4).
- [x] [Consolidate](subtasks/m2-trans-06-consolidate.md) — value-preserving; sweeps stray-stake funds back.
- [x] [Remove access entry](subtasks/m2-trans-07-remove-access.md) — constant-work prune to stay under caps.
- [x] [Set intended stake credential](subtasks/m2-trans-08-set-stake-credential.md) — isolated operator action, no wallet spend.
- [x] [Staking & governance](subtasks/m2-trans-09-staking-governance.md) — wallet `withdraw`/`publish`/`vote` entrypoints (rewards, delegation/certs, votes), all operator-gated (§4.5). No `propose` purpose by design (audit F-9): submitting a governance action needs only a deposit + spend authorization, so the UI's propose flow funds it through the spend path.

### Limits & tests (§6 Formal Model, §7 Security Analysis)

- [x] [Access-list caps (15/25/25)](subtasks/m2-test-01-caps.md) keeping every transition within the tx budget.
- [x] [Unit suite](subtasks/m2-test-02-suite.md) — mint, spend, every transition, caps, prune.
- [x] [Attack-vector log](subtasks/m2-test-02-suite.md) — each known attack reproduced and asserted to fail.
- [x] [Fuzz/property pass](subtasks/m2-test-02-suite.md) over the value + access primitives.
- [x] [Threat-model self-audit + validator gap analysis](subtasks/m2-test-02-suite.md) (docs pruned in the June repo cleanup; the attack tests they produced are in the suite).

### Build & integration

- [x] [End-to-end `.mjs` scripts against a live node](subtasks/m2-build-01-offchain.md).
- [x] [Blueprint emit (`aiken build`) + frontend sync (`pnpm sync:blueprint`)](subtasks/m2-build-02-blueprint.md).

## Non-development tasks

- [x] Docs — README for new developers. (CONTEXT.md, ADRs and CHANGELOG existed during development; pruned in the June repo cleanup.)
- [ ] **Abuse-vector writeup for reviewers** — both sides exist (13 `attack_*` fail tests + 5 intentional controls in the attack log, ~106 more `fail` rejections across the validator suite; 11 *Security Analysis* invariants + 17 threat-table scenarios in the whitepaper); what's missing is the explicit two-way map.
  - [ ] [Cross-map attack tests ↔ security prose, list the gaps](subtasks/m2-abuse-01-crossmap.md)
  - [ ] [Prose for tested-but-unwritten attacks](subtasks/m2-abuse-02-prose-gaps.md)
  - [ ] [Tests for claimed-but-untested vectors (dev)](subtasks/m2-abuse-03-test-gaps.md)
  - [ ] [Publish the reviewer map in the contracts README](subtasks/m2-abuse-04-publish.md)
- [ ] GitHub project link as evidence.

## Acceptance criteria (Catalyst)

- The contract implements the methods from the whitepaper
- It's documented well enough for a new developer to follow
- Abuse vectors are spelled out and shown not to work

## Evidence

- Link to the GitHub project
