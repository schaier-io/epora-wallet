# Feature: wallet creation & funding (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Receiving funds needs no datum*

## What landed

- [x] Mint flow: [mint-state-token.ts](../../code/dApp/src/lib/mesh/transactions/mint-state-token.ts) builder, [config-mint-view.tsx](../../code/dApp/src/components/user/workspace/config-mint-view.tsx), defaults via [lib/contracts/defaults.ts](../../code/dApp/src/lib/contracts/defaults.ts) + [workspace-mint-defaults.atoms.ts](../../code/dApp/src/components/user/workspace/atoms/workspace-mint-defaults.atoms.ts).
- [x] Funding: [lock-funds.ts](../../code/dApp/src/lib/mesh/transactions/lock-funds.ts) + [config-lockfunds-view.tsx](../../code/dApp/src/components/user/workspace/config-lockfunds-view.tsx); receiving needs no datum — any wallet can pay the address directly.
- [x] Reference-script deploy: [deploy-shared-reference.ts](../../code/dApp/src/lib/mesh/transactions/deploy-shared-reference.ts) + the [use-shared-stt-reference.ts](../../code/dApp/src/components/user/workspace/use-shared-stt-reference.ts) setup prompt.

## Verified by

- Walkthrough rows 1–2 ([m3-walk-02](m3-walk-02-run.md)); engine internals tests.
