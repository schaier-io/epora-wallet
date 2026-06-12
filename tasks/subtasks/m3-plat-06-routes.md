# API: existing routes (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md)

## What landed

- [x] [api/mesh](../../code/dApp/src/app/api/mesh/route.ts) — provider proxy (keys stay server-side).
- [x] [api/stt/sync](../../code/dApp/src/app/api/stt/sync/route.ts) — indexer trigger; [api/stt/lookup](../../code/dApp/src/app/api/stt/lookup/route.ts) — cached wallet lookup. Input validated with zod.
- [x] Feature routes live with their features: [pools](../../code/dApp/src/app/api/pools/route.ts), [koios/credential-utxos](../../code/dApp/src/app/api/koios/credential-utxos/route.ts), [proposals/*](../../code/dApp/src/app/api/proposals/route.ts).
- The public, versioned surface (`/api/v1/`, spec, rate limits) is the open [API subtask group](m3-api-01-shared-schemas.md).

## Verified by

- Sync/lookup logic tested in [lib/stt-cache](../../code/dApp/src/lib/stt-cache/integration.test.ts); handlers stay thin.
