# Feature: self-custody & stake control (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Pinning the stake credential*, *Implementation*

## What landed

- [x] Builders: [set-intended-stake-credential.ts](../../code/dApp/src/lib/mesh/transactions/set-intended-stake-credential.ts), [consolidate-utxos.ts](../../code/dApp/src/lib/mesh/transactions/consolidate-utxos.ts), [wallet-withdraw.ts](../../code/dApp/src/lib/mesh/transactions/wallet-withdraw.ts) (rewards), [wallet-governance.ts](../../code/dApp/src/lib/mesh/transactions/wallet-governance.ts) (certs/votes/propose funding).
- [x] Stake-pool finder: [pool-finder.tsx](../../code/dApp/src/components/user/pool-finder.tsx) + [api/pools](../../code/dApp/src/app/api/pools/route.ts).
- [x] Stake diagnostic — orphan detection + sweep prompt: [lib/discovery/orphan-utxos.ts](../../code/dApp/src/lib/discovery/orphan-utxos.ts), [hooks/use-orphan-wallet-utxos.ts](../../code/dApp/src/hooks/use-orphan-wallet-utxos.ts), [orphan-utxo-notice.tsx](../../code/dApp/src/components/user/orphan-utxo-notice.tsx), [stake-address-discovery-panel.tsx](../../code/dApp/src/components/user/stake-address-discovery-panel.tsx).

## Verified by

- Walkthrough rows 12–15, 17 ([m3-walk-02](m3-walk-02-run.md)).
