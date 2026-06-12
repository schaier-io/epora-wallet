# Platform: transaction engine (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Implementation*

## What landed

- [x] Generic STT-spend build path [lib/mesh/transactions/stt-spend.ts](../../code/dApp/src/lib/mesh/transactions/stt-spend.ts) — every transition builds through it; submit in [submit.ts](../../code/dApp/src/lib/mesh/transactions/submit.ts).
- [x] Per-action builders: [mint-state-token.ts](../../code/dApp/src/lib/mesh/transactions/mint-state-token.ts), [lock-funds.ts](../../code/dApp/src/lib/mesh/transactions/lock-funds.ts), [wallet-spend.ts](../../code/dApp/src/lib/mesh/transactions/wallet-spend.ts), [wallet-withdraw.ts](../../code/dApp/src/lib/mesh/transactions/wallet-withdraw.ts), [wallet-governance.ts](../../code/dApp/src/lib/mesh/transactions/wallet-governance.ts), [set-intended-stake-credential.ts](../../code/dApp/src/lib/mesh/transactions/set-intended-stake-credential.ts), [consolidate-utxos.ts](../../code/dApp/src/lib/mesh/transactions/consolidate-utxos.ts), [deploy-shared-reference.ts](../../code/dApp/src/lib/mesh/transactions/deploy-shared-reference.ts).
- [x] Internals split per concern in [internals/](../../code/dApp/src/lib/mesh/transactions/internals): budget, core, datum, value, utxo, witness, guards, reference-scripts, script-data, errors.

## Verified by

- Internals tests: [datum](../../code/dApp/src/lib/mesh/transactions/internals/datum.test.ts), [utxo](../../code/dApp/src/lib/mesh/transactions/internals/utxo.test.ts), [value](../../code/dApp/src/lib/mesh/transactions/internals/value.test.ts).
