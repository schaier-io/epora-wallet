# Transition: use beneficiary (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Weighted-share beneficiary recovery*, *Credential aggregation*

## What landed

- [x] Unlock = proof-of-life lapse + personal `unlock_after` ([lib/state/proof_of_life.ak](../../code/smart-contract/lib/state/proof_of_life.ak)); authority via `expect_single_beneficiary_with_unlock_authority` ([lib/state/authorization.ak](../../code/smart-contract/lib/state/authorization.ak)).
- [x] Share clamp in [lib/wallet/rules.ak](../../code/smart-contract/lib/wallet/rules.ak): up to `weight / Σ remaining weights × (pool − streaming reserve)` per asset, weights read from the input state.
- [x] One-shot: the actor is removed in the same tx (`state_unchanged_except_beneficiary_removed`), so shares are order-independent and always sum to the pool; the last removal may reach a terminal state (intentional).
- [x] Value aggregated by payment credential — no share multiplication across stake variants.

## Verified by

- [stt_beneficiary_streaming_tests.ak](../../code/smart-contract/validators/stt_beneficiary_streaming_tests.ak); attack-log `attack_beneficiary_cannot_unlock_before_the_boundary_time`, `attack_beneficiary_cannot_drain_multiple_stake_variants_per_tx`; control `security_intentional__use_beneficiary_last_removal_reaches_terminal_state`.
- Share-clamp property tests co-located in `rules.ak`.
