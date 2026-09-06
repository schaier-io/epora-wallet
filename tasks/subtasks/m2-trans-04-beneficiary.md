# Transition: use beneficiary (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Weighted-share beneficiary recovery*, *Credential aggregation*

## What landed

- [x] Unlock = proof-of-life lapse + personal `unlock_after` ([lib/state/proof_of_life.ak](../../code/smart-contract/lib/state/proof_of_life.ak)); authority via `expect_single_beneficiary_with_unlock_authority` ([lib/state/authorization.ak](../../code/smart-contract/lib/state/authorization.ak)).
- [x] Share clamp in [lib/wallet/beneficiary_share.ak](../../code/smart-contract/lib/wallet/beneficiary_share.ak): up to `weight / Σ remaining weights × (pool − streaming reserve)` per asset, with weights read from the input State.
- [x] Each nonfinal beneficiary is removed in the same transaction (`state_unchanged_except_beneficiary_removed`), so that beneficiary acts once. The final beneficiary stays in State and can recover separate wallet UTxOs through repeated transactions.
- [x] A value-moving action may consume any wallet-input count that fits ledger and action limits. Final-beneficiary recovery may leave reserve-aware change. It can retry with fewer inputs or a smaller draw after the shared 30-minute cooldown.
- [x] No transaction can prove that another UTxO does not exist or that no future deposit will arrive. The contract has no final recovery marker. Wallet UTxO recovery does not withdraw staking rewards.
- [x] Value is aggregated by payment credential, so a beneficiary cannot multiply its share across stake variants in one transaction.

## Verified by

- [stt_beneficiary_tests.ak](../../code/smart-contract/validators/stt_beneficiary_tests.ak): `beneficiary_use_rejects_retained_nonfinal_beneficiary`, `beneficiary_use_preserves_final_beneficiary_for_repeatable_recovery`, and `beneficiary_use_rejects_removing_final_beneficiary`.
- [wallet_spend_tests.ak](../../code/smart-contract/validators/wallet_spend_tests.ak): `final_beneficiary_can_repeat_full_sweeps_over_native_asset_cap`, `final_beneficiary_can_leave_reserved_asset_in_wide_fund_pool`, and `final_beneficiary_cannot_spend_reserved_asset_in_wide_fund_pool`; [stt_beneficiary_tests.ak](../../code/smart-contract/validators/stt_beneficiary_tests.ak): final-beneficiary cadence tests; [security_attack_log_tests.ak](../../code/smart-contract/validators/security_attack_log_tests.ak): `security_recovery__final_beneficiary_remains_reachable`.
- Share-clamp property tests co-located in `lib/wallet/beneficiary_share.ak`.
