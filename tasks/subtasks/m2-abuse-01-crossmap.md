# Abuse writeup: cross-map attack tests ↔ security prose

Reviewer-docs task · [Milestone 2](../milestone-2-smart-contract.md) · Catalyst criterion: "abuse vectors are spelled out and shown not to work"

Both sides exist; neither cites the other. Test side: [security_attack_log_tests.ak](../../code/smart-contract/validators/security_attack_log_tests.ak) — 13 `attack_*` `fail` tests + 5 `security_intentional__*` controls — plus ~106 more `fail` rejections across the other fifteen validator test files. Prose side: 11 *Security Analysis* invariants (each "backed by a regression test") and 17 *Threats mitigated in practice* scenarios + the wrench-attack walkthrough. The map cites whitepaper sections **by name**, never by number (numbers shifted in a recent reorg).

## Steps

- [ ] Build the map as a table, one row per abuse vector: the vector in plain words · the whitepaper item covering it (*Security Analysis* invariant or threat-table row, by name) · the test(s) reproducing it (file + test name).
- [ ] Map all 13 attack-log tests first. Where an invariant's real evidence lives elsewhere, point there — e.g. settlement cadence in [stt_payout_cooldown_tests.ak](../../code/smart-contract/validators/stt_payout_cooldown_tests.ak), caps in [config_cap_tests.ak](../../code/smart-contract/validators/config_cap_tests.ak); lib-level property tests (README "Property-based tests" table) count where the invariant is arithmetic.
- [ ] Triage the remaining validator `fail` tests: rows for the ones encoding adversarial intent (forged anchor, foreign credential, double satisfaction, …); plain input-validation rejections stay out.
- [ ] Record the leftovers on both sides: tests with no prose feed [m2-abuse-02](m2-abuse-02-prose-gaps.md), claims with no test feed [m2-abuse-03](m2-abuse-03-test-gaps.md).

## Done when

- Every `security_attack_log__attack_*` test has a row; every *Security Analysis* invariant and every threat-table row appears in a row or on a gap list.
- The two gap lists are explicit enough that 02 and 03 need no re-survey.
