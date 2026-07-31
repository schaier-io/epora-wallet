# Build: end-to-end off-chain scripts (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Implementation*

## What landed

- [x] [offchain/](../../code/smart-contract/offchain) maintained Mesh bootstrap scripts against a live node: `generate-credentials`, `mint-stt` (`pnpm mint`), `fund-wallet-example`, and `cleanup-utxo`. Mutable lifecycle transactions use the dApp's production builders so datum/redeemer encodings have one owner.
- [x] House rule: a script that no longer validates under the current contract model is deleted, not kept as reference.

## Verified by

- Ran against a live network during development; the per-feature on-chain pass with recorded tx hashes is M3's [walkthrough](m3-walk-02-run.md).
