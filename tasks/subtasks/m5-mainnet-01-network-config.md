# Mainnet: network as configuration

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md)

Preprod is hardcoded: `NETWORK = "preprod"` in [internals/constants.ts](../../code/dApp/src/lib/mesh/transactions/internals/constants.ts), `STT_CACHE_NETWORK = "preprod"` in [stt-cache/domain.ts](../../code/dApp/src/lib/stt-cache/domain.ts), and the Blockfrost provider reads `BLOCKFROST_PREPROD_PROJECT_ID` only ([blockfrost-server.ts](../../code/dApp/src/lib/mesh/blockfrost-server.ts)). The Koios proxy already knows the mainnet URL. The offchain `.mjs` scripts hardcode preprod too — leave those, they're dev tools.

## Steps

- [ ] One env var (`CARDANO_NETWORK`) feeds both constants and selects the Blockfrost key (`BLOCKFROST_MAINNET_PROJECT_ID` on mainnet).
- [ ] `grep -rn '"preprod"' code/dApp/src/` and account for every remaining hit — Koios default, address derivation, explorer links, anything. The audit table goes in the PR.
- [ ] Update [.env.example](../../code/dApp/.env.example) with the new vars and a one-line "preprod vs mainnet" note.
- [ ] Preprod deployment must behave identically after the change — this lands and soaks on testnet first.

## Done when

- Switching the env var alone re-targets the app; no source edits.
- The grep audit shows zero unaccounted `"preprod"` literals.
- Preprod deployment is unaffected (smoke pass).
