# Testnet deploy: shared STT reference store

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

One global reference store per network holds the STT script as a reference script. It deploys from the UI ([deploy-shared-reference.ts](../../code/dApp/src/lib/mesh/transactions/deploy-shared-reference.ts), detection in [use-shared-stt-reference.ts](../../code/dApp/src/components/user/workspace/use-shared-stt-reference.ts)) and every wallet on the deployment relies on it.

## Steps

- [ ] Deploy the store once from the live UI (the setup-helper prompt appears when detection finds none).
- [ ] Confirm detection: reload, the app finds the store and stops offering to create it; the duplicate guard (`allowDuplicateCurrentScriptReferences`) holds.
- [ ] Record the store address and deploy tx hash in the milestone file's evidence section.

## Done when

- The deployed app detects the store on a cold load.
- Address + tx hash recorded as milestone evidence.
