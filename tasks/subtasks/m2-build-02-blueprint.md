# Build: blueprint emit + frontend sync (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Implementation*

## What landed

- [x] `aiken build` (compiler pinned v1.1.22 in [aiken.toml](../../code/smart-contract/aiken.toml), Plutus v3) emits the CIP-57 blueprint [plutus.json](../../code/smart-contract/plutus.json).
- [x] `pnpm sync:blueprint` ([scripts/sync-blueprint.mjs](../../code/dApp/scripts/sync-blueprint.mjs)) copies it into the dApp, which loads and parameterizes it rather than embedding script bytes.
- [x] Rebuild order in the contracts [README](../../code/smart-contract/README.md): build → sync → recreate the reference-store UTxO → mint fresh. Renames cross contracts + blueprint + frontend in one pass, no aliases.

## Verified by

- Frontend contract-binding tests consume the synced blueprint; a stale copy fails them.
