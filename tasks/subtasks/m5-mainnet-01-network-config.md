# Mainnet: network as configuration

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md)

VERIFIED 2026-09-26: network configuration is implemented on `main` at `d3b5a239`.
The earlier claim that the application hardcoded Preprod was stale.
`src/lib/cardano-network.ts` reads `NEXT_PUBLIC_CARDANO_NETWORK`; both transaction constants and cache domain import `CARDANO_NETWORK`.
`src/lib/mesh/blockfrost-server.ts` selects `BLOCKFROST_MAINNET_PROJECT_ID` for mainnet.
Paths above are under `code/dApp`. The [live checks](../milestone-5-mainnet-closeout.md#live-deployment-check-2026-09-26) confirm both deployments respond.

## Steps

- [x] `NEXT_PUBLIC_CARDANO_NETWORK` feeds both constants and selects the network's Blockfrost key. Rebuild after changing it.
- [ ] `grep -rn '"preprod"' code/dApp/src/` and account for every remaining hit — Koios default, address derivation, explorer links, anything. The audit table goes in the PR.
- [x] Document the network variables. VERIFIED: `main` at `d3b5a239`, `code/dApp/.env.example:1-9`, contains the build-time network, separate-mainnet-deployment note, and mainnet provider key.
- [ ] Preprod deployment must behave identically after the change — this lands and soaks on testnet first.

## Done when

- Switching the env var alone re-targets the app; no source edits.
- The grep audit shows zero unaccounted `"preprod"` literals.
- Preprod deployment is unaffected (smoke pass).
