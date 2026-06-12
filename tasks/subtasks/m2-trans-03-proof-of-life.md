# Transition: renew proof-of-life (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *The dead-man-switch*, *Proof-of-life ceiling* theorem

## What landed

- [x] Renewal window ([lib/state/proof_of_life.ak](../../code/smart-contract/lib/state/proof_of_life.ak) `has_valid_renewal_window`): new deadline ≥ tx latest bound, ≤ one increment past the earliest bound.
- [x] Signer must hold `can_renew_proof_of_life` ([lib/stt/action_checks.ak](../../code/smart-contract/lib/stt/action_checks.ak) `proof_of_life_user_signature_matches`).
- [x] No wallet movement; diff pinned to the unlock time (`state_unchanged_except_pol_unlock_time`).
- [x] Beneficiary-side consumers (`calculate_beneficiary_unlock_time`, `is_unlock_time_reached`) in the same module — one timing model.

## Verified by

- Attack-log `attack_renew_proof_of_life_cannot_set_unlock_before_tx_upper_bound`, `attack_renew_proof_of_life_cannot_extend_beyond_increment_via_wide_validity_range`.
- Window property tests in [lib/state/state_tests.ak](../../code/smart-contract/lib/state/state_tests.ak).
