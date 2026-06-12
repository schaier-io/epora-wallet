# Platform: chain data & indexing (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Implementation* (no API key in the browser)

## What landed

- [x] Server-side fetchers only: [lib/mesh/blockfrost-server.ts](../../code/dApp/src/lib/mesh/blockfrost-server.ts) + [server-fetcher.ts](../../code/dApp/src/lib/mesh/server-fetcher.ts); Koios client [lib/discovery/koios-client.ts](../../code/dApp/src/lib/discovery/koios-client.ts) behind [api/koios/credential-utxos](../../code/dApp/src/app/api/koios/credential-utxos/route.ts).
- [x] STT detection in [lib/mesh/detection.ts](../../code/dApp/src/lib/mesh/detection.ts).
- [x] STT cache [lib/stt-cache/](../../code/dApp/src/lib/stt-cache): indexer + persistence, lookup, participants, domain — Prisma-backed, drives `/api/stt/sync` and `/api/stt/lookup`.

## Verified by

- stt-cache tests: [domain](../../code/dApp/src/lib/stt-cache/domain.test.ts), [participants](../../code/dApp/src/lib/stt-cache/participants.test.ts), [integration](../../code/dApp/src/lib/stt-cache/integration.test.ts) (runs against the scratch schema).
