# Abuse writeup: tests for claimed-but-untested vectors

Contract test task (dev) · [Milestone 2](../milestone-2-smart-contract.md) · Catalyst criterion: "abuse vectors are spelled out and shown not to work"

Input: the claims-without-test gap list from [m2-abuse-01](m2-abuse-01-crossmap.md). The whitepaper's *Security Analysis* asserts every invariant "is backed by a regression test that reproduces the corresponding attack" — any claim the inventory could not pin to a test is a finding: either the test is missing or the prose overclaims.

## Steps

- [ ] Per gap, decide: attack test, or prose correction. A mitigated-abuse claim that cannot be expressed as a rejected transaction gets its prose corrected — or moved to *Limitations and Trust Assumptions* if the gap is an intentional trade-off — instead of a contrived test.
- [ ] New tests follow the house pattern: a `security_attack_log__attack_*` `fail` test in [security_attack_log_tests.ak](../../code/smart-contract/validators/security_attack_log_tests.ak) (or the matching `<area>_tests.ak` for cooldown/caps/etc.), built from [lib/test_support/security_fixtures.ak](../../code/smart-contract/lib/test_support/security_fixtures.ak) helpers, with the transaction well-formed enough that the validator must actively notice the violation.
- [ ] `aiken check` green on the pinned compiler; the check count changes, so state the new count in the commit message (contracts CLAUDE.md rule 8). No validator/lib logic changes in this pass — a test that *can't* be made to fail is a security finding to raise, not patch silently.
- [ ] Add each new test (or prose correction) to the map.

## Done when

- Every mitigated-abuse claim in *Security Analysis* and the threat tables names at least one green reproducing test, or its prose was corrected in the same pass.
- `aiken check` green; the claims-without-test list is empty.
