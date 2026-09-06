# Transition: consolidate (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Pinning the stake credential*, transition table

## What landed

- [x] `Consolidate(path)`: wallet input value must equal output value exactly ([settlement_handlers.ak](../../code/smart-contract/lib/stt/settlement_handlers.ak) `eval_consolidate`); no `State` field changes.
- [x] Compatible stray inputs re-home through payment-credential aggregation and output pinning. One consolidation can collect or repartition wallet UTxOs in either direction. The aggregate wallet input and output Values must remain equal. Ledger byte-size and ExUnit limits decide which shapes fit.
- [x] `ConsolidatePath` adds `BeneficiaryPath` to admin/multisig: an unlocked beneficiary may consolidate but never reach operator actions ([lib/state/authorization.ak](../../code/smart-contract/lib/state/authorization.ak) `has_consolidate_authority`).

## Verified by

- Consolidate cases in [guard_isolation_tests.ak](../../code/smart-contract/validators/guard_isolation_tests.ak), [stt_settlement_tests.ak](../../code/smart-contract/validators/stt_settlement_tests.ak), and [stt_fuzz_tests.ak](../../code/smart-contract/validators/stt_fuzz_tests.ak). Focused wallet tests cover multiple inputs, multiple outputs, dense native-asset Values, and rejection of changed aggregate Value.
