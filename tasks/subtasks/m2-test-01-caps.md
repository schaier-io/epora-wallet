# Limits: access-list and inner-collection caps (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Bounded execution cost*

## What landed

- [x] Outer caps: at most 10 user records, 15 beneficiary records, 15 access records across both lists, and 15 streaming-payment schedules.
- [x] Wallet-id caps: at most 10 per user, 15 across all users, 10 per beneficiary, and 15 across all beneficiaries.
- [x] Allowance caps: at most 5 asset entries in each bundle. Across all users, `Σ(per_day + max(per_day, remaining))` is at most 15. This reserves reset growth.
- [x] Other State caps: wallet names contain at most 32 bytes. Each streaming schedule names exactly one asset.
- [x] Transaction caps: the contract sets no global wallet-input, general transaction-input, general output, ordinary-redeemer, or positive-schedule payout count. `UseAllowance`, `UseBeneficiary`, and `PayStreamingPayment` still limit continuing wallet outputs to consumed wallet inputs. Ledger byte size, combined ExUnits, and action-specific limits decide other transaction shapes.
- [x] Wallet Value caps: `UseAllowance` and nonfinal `UseBeneficiary` allow at most 5 native-asset rows in each wallet input or output and in each aggregate side. ADA does not count. Operator cleanup, payout, final-beneficiary recovery, and value-preserving Consolidation are exempt.
- [x] State caps are enforced at mint and `UpdateState` (`expect_valid_state_configuration`, `shape.expect_valid`). The allowance-spend path rechecks the same reserved allowance footprint.
- [x] On-chain validators enforce State caps and the action-specific wallet limits. The dApp mirrors the persistent State and builder constraints, then checks final transaction size and reported execution budgets.
- [x] Growth-cost ordering: access growth uses `UpdateState`, and schedule growth uses `ManageStreamingPayments`. [`RemoveAccessIndex`](m2-trans-07-remove-access.md) is cap-exempt.

## Verified by

- [config_cap_tests.ak](../../code/smart-contract/validators/config_cap_tests.ak) covers each State boundary with at-cap acceptance and cap-plus-one rejection cases.
- [transaction_budget_tests.ak](../../code/smart-contract/validators/transaction_budget_tests.ak) measures grouped STT and wallet-validator costs at the user, combined-access, wallet, allowance, and stream caps with a minimum useful action.
- [check-budgets.mjs](../../code/smart-contract/scripts/check-budgets.mjs) applies 14,000,000 memory and 9,000,000,000 CPU ceilings to each named validator group. An arbitrary co-spent external validator is outside those groups.
