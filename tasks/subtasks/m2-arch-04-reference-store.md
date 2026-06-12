# Architecture: always-fail STT reference store (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Implementation*

## What landed

- [x] [validators/stt_reference_store.ak](../../code/smart-contract/validators/stt_reference_store.ak) — `spend` and `else` fail unconditionally; the UTxO holding the STT reference script can never be moved or swept.
- [x] Deploy wiring: the store UTxO is created from the dApp's setup prompt; rebuild order (build → store → mint) in the contracts [README](../../code/smart-contract/README.md).

## Verified by

- `stt_reference_store_rejects_every_spend_attempt` — in-module `fail` test (sanctioned co-located site).
