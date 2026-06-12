# Fix loop: rules for contract-touching fixes

Fix loop task · [Milestone 4](../milestone-4-testnet-feedback.md)

A validator change is not a normal fix: the script hash changes, and on-chain wallets are pinned to the hash they were created with. Decide the rules before the first such fix, not during it.

## Steps

- [ ] Checklist for any validator-touching PR: full Aiken suite + fuzz pass, `aiken build` with the pinned compiler version (must match `aiken.toml` — CI checks this), blueprint autosync lands the new `plutus.json` in the frontend, new script hashes noted in the PR.
- [ ] A changed STT script hash means **new wallets only** — existing test wallets stay on the old script and keep working against it. Say so in the issue every time, or testers will report "the fix didn't work".
- [ ] If the STT script hash changed, deploy a reference store for the new script ([deploy-shared-reference.ts](../../code/dApp/src/lib/mesh/transactions/deploy-shared-reference.ts)) and record it like the [original](m4-deploy-04-reference-store.md).

## Done when

- The checklist is written into the contributing notes and was followed on the first contract fix (or is documented as unused this milestone).
