# Mainnet: production environment + database

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md) · after [network config](m5-mainnet-01-network-config.md)

Mainnet runs beside preprod, not instead of it — preprod stays the testing ground for the fix loop. Wallets and sync cursors are keyed by network in the Prisma schema, so data can't collide; use a separate database anyway.

## Steps

- [x] Mainnet app boots and indexes at its own domain. VERIFIED: [live deployment checks on 2026-09-26](../milestone-5-mainnet-closeout.md#live-deployment-check-2026-09-26).
- [ ] Verify separate `STT_SYNC_SECRET`/`PROPOSAL_AUTH_SECRET` and provider configuration in the deployment settings. The implemented build-time variable is `NEXT_PUBLIC_CARDANO_NETWORK`.
- [ ] Fresh mainnet Postgres; `prisma migrate deploy`.
- [ ] Own sync cron against the mainnet deployment (same shape as [the testnet one](m4-deploy-03-sync-cron.md)).
- [x] Confirm Preprod remains online. VERIFIED: its health endpoint returned HTTP 200 with database and indexer up on 2026-09-26. This does not prove every flow is unchanged.

## Done when

- Mainnet app boots and indexes; preprod app still runs.
- The two deployments share zero secrets and zero databases.
