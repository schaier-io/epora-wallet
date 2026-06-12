# Tests: unit suite, attack log, fuzz (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: Security Analysis ("each invariant is backed by a regression test")

Counts as of 2026-06-12; `aiken check` green on the pinned compiler (v1.1.22).

## What landed

- [x] 21 `*_tests.ak` files — 16 under [validators/](../../code/smart-contract/validators), 5 under `lib/` — ~119 `fail` rejection tests suite-wide.
- [x] Attack log ([security_attack_log_tests.ak](../../code/smart-contract/validators/security_attack_log_tests.ak)): 13 `attack_*` `fail` tests (well-formed transactions the validator must actively reject) + 5 `security_intentional__*` positive controls. Whitepaper cross-map: the open [abuse writeup](m2-abuse-01-crossmap.md).
- [x] Fuzz: `prop_*` tests over value math, multisig thresholds, proof-of-life windows, allowance reset, weighted shares, accrual — inventoried in the README's property-test table; generators in [lib/test_support/fuzz_generators.ak](../../code/smart-contract/lib/test_support/fuzz_generators.ak).
- [x] Shared fixtures in [lib/test_support/](../../code/smart-contract/lib/test_support); tests live in `*_tests.ak` files except the sanctioned private-access sites.
- [x] The pruned threat-model/gap-analysis docs survive as audit-tagged regression tests and comments (`audit I-5`, `F-9`, `A1`, …); the whitepaper carries the analysis.

## Verified by

- `aiken check` — whole suite; last full re-verification date in the tasks [README](../README.md).
