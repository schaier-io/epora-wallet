# Transition: use allowance (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Allowance velocity*

## What landed

- [x] `UseAllowance(delta)`: the STT proves the declared delta equals the drop in `remaining_allowance` ([lib/state/allowance.ak](../../code/smart-contract/lib/state/allowance.ak) `expect_allowance_updates`); the wallet pays out exactly that delta ([lib/wallet/rules.ak](../../code/smart-contract/lib/wallet/rules.ak)).
- [x] Daily reset anchored to tx bounds — reset from the *earliest* bound, next deadline from the *latest* — so a wide window can't fake a reset and a stale anchor can't buy a second spend in a day.
- [x] The changed user must sign; an allowance spend may renew proof-of-life only for the signer ([lib/stt/action_checks.ak](../../code/smart-contract/lib/stt/action_checks.ak)).
- [x] `remaining_allowance` entries capped on the spend path too (`max_allowance_entries`).

## Verified by

- [stt_allowance_tests.ak](../../code/smart-contract/validators/stt_allowance_tests.ak); attack-log `attack_allowance_reset_cannot_anchor_to_stale_lower_bound`, `attack_allowance_cannot_renew_proof_of_life_for_the_wrong_user`.
- Reset property tests co-located in `allowance.ak`.
