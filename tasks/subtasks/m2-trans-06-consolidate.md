# Transition: consolidate (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Pinning the stake credential* (the sweep), transition table

## What landed

- [x] `Consolidate(path)`: wallet input value must equal output value exactly ([spend_handlers](../../code/smart-contract/lib/stt/spend_handlers.ak) `eval_consolidate`); no `State` field changes.
- [x] Sweep falls out of the architecture: inputs aggregate by payment credential, outputs are pinned to the intended stake credential — strays re-home with no dedicated rule.
- [x] `ConsolidatePath` adds `BeneficiaryPath` to admin/multisig: an unlocked beneficiary may consolidate but never reach operator actions ([lib/state/authorization.ak](../../code/smart-contract/lib/state/authorization.ak) `has_consolidate_authority`).

## Verified by

- Consolidate cases in [guard_isolation_tests.ak](../../code/smart-contract/validators/guard_isolation_tests.ak), [stt_beneficiary_streaming_tests.ak](../../code/smart-contract/validators/stt_beneficiary_streaming_tests.ak), [stt_fuzz_tests.ak](../../code/smart-contract/validators/stt_fuzz_tests.ak).
