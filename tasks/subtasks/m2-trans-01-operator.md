# Transition: operator Use / UpdateState (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Owners, allowances, and multi-signature*, *Recovery reachability*

## What landed

- [x] Authority: admin signature or weighted multisig meeting the threshold — [lib/state/authorization.ak](../../code/smart-contract/lib/state/authorization.ak) `has_operator_authority`; the power-sum has one audited definition ([configuration.ak](../../code/smart-contract/lib/state/configuration.ak) `sum_multisig_power` / `multisig_threshold_is_met`).
- [x] `Use` ([spend_handlers](../../code/smart-contract/lib/stt/spend_handlers.ak) `eval_operator_use`) — free-form spend floored by the streaming reserve; may advance the proof-of-life unlock time alongside (advisory renewal, recorded in *Limitations and Trust Assumptions*).
- [x] `UpdateState` (`eval_operator_state_update`) — full rewrite re-running `expect_valid_state_configuration` + `has_reachable_access_path` (a recovery-less dead end is unrepresentable); by construction the most expensive transition.
- [x] Admin reference-script carve-out (`is_admin_operator_action`, [lib/stt/io.ak](../../code/smart-contract/lib/stt/io.ak)).

## Verified by

- [stt_operator_tests.ak](../../code/smart-contract/validators/stt_operator_tests.ak) — 9 `fail` rejections + accepting cases.
- Threshold property tests in [lib/state/state_tests.ak](../../code/smart-contract/lib/state/state_tests.ak); shared-key role-counting controls in the attack log.
