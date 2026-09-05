# Limits: access-list and inner-collection caps (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Bounded execution cost*

## What landed

- [x] Outer caps: at most 10 user records, 15 beneficiary records, 15 access records across both lists, and 15 streaming-payment schedules.
- [x] Wallet-id caps: at most 10 per user, 15 across all users, 10 per beneficiary, and 15 across all beneficiaries.
- [x] Allowance caps: at most 5 asset entries in each allowance bundle and 15 entries across both bundles for all users.
- [x] Other State caps: wallet names contain at most 32 bytes. Each streaming schedule names exactly one asset.
- [x] Transaction caps: a normal value-moving spend consumes at most one wallet input, consolidation consumes at most two, and a payout advances at most two schedules by positive amounts.
- [x] Wallet Value caps: `UseAllowance`, nonterminal `UseBeneficiary`, and `Consolidate` allow at most 5 native-asset rows. ADA does not count. Operator cleanup, payout, and terminal recovery are exempt.
- [x] State caps are enforced at mint and `UpdateState` (`expect_valid_state_configuration`, `shape.expect_valid`). The allowance-spend path rechecks its mutable allowance total.
- [x] On-chain validators enforce payout and wallet-input caps. The dApp mirrors State caps, per-action wallet caps, payout batch size, and final transaction collection caps.
- [x] Growth-cost ordering: access growth uses `UpdateState`, and schedule growth uses `ManageStreamingPayments`. [`RemoveAccessIndex`](m2-trans-07-remove-access.md) is cap-exempt.

## Verified by

- [config_cap_tests.ak](../../code/smart-contract/validators/config_cap_tests.ak) covers each State boundary with at-cap acceptance and cap-plus-one rejection cases.
- [transaction_budget_tests.ak](../../code/smart-contract/validators/transaction_budget_tests.ak) measures grouped STT and wallet-validator costs at the maximum supported State shape.
- [check-budgets.mjs](../../code/smart-contract/scripts/check-budgets.mjs) applies 14,000,000 memory and 9,000,000,000 CPU ceilings to each named validator group. An arbitrary co-spent external validator is outside those groups.
