# Feature: beneficiary recovery (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Weighted-share beneficiary recovery*

## What landed

- [x] Beneficiary editor (wallets, weight, optional vesting delay) in [people-editors.tsx](../../code/dApp/src/components/user/workspace/editors/people-editors.tsx); state fields in [state-form.ts](../../code/dApp/src/lib/contracts/state-form.ts).
- [x] Weighted-share withdrawal derivation uses the pool minus the streaming reserve. It feeds the `use-beneficiary` guided flow through the shared engine.
- [x] Each nonfinal beneficiary leaves the State after one recovery. The sole final beneficiary remains for repeat recovery.

## Verified by

- [state-derivation](../../code/dApp/src/lib/contracts/state-derivation.test.ts) + [state-form](../../code/dApp/src/lib/contracts/state-form.test.ts) tests; walkthrough row 9.
