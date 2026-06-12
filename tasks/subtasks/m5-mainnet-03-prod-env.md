# Mainnet: production environment + database

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md) · after [network config](m5-mainnet-01-network-config.md)

Mainnet runs beside preprod, not instead of it — preprod stays the testing ground for the fix loop. Wallets and sync cursors are keyed by network in the Prisma schema, so data can't collide; use a separate database anyway.

## Steps

- [ ] Second deployment of the same codebase: `CARDANO_NETWORK=mainnet`, `BLOCKFROST_MAINNET_PROJECT_ID`, own `STT_SYNC_SECRET`/`PROPOSAL_AUTH_SECRET`, own domain.
- [ ] Fresh mainnet Postgres; `prisma migrate deploy`.
- [ ] Own sync cron against the mainnet deployment (same shape as [the testnet one](m4-deploy-03-sync-cron.md)).
- [ ] Confirm the preprod deployment is untouched.

## Done when

- Mainnet app boots and indexes; preprod app still runs.
- The two deployments share zero secrets and zero databases.
