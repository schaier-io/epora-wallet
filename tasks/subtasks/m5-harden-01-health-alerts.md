# Hardening: health endpoint + tested alerting

Hardening task · [Milestone 5](../milestone-5-mainnet-closeout.md)

The failure that matters most is the quiet one: the sync cron dies, the cache decays, lookups serve stale state, nobody notices for a week.

## Steps

- [x] `/api/health` reports cursor freshness and database reachability. VERIFIED: mainnet and Preprod returned HTTP 200 with database/indexer up in the [2026-09-26 check](../milestone-5-mainnet-closeout.md#live-deployment-check-2026-09-26). Source: `main` at `d3b5a239`, `code/dApp/src/app/api/health/route.ts`, `GET`.
- [ ] Uptime probe on the app URL plus the health endpoint; alert when a cursor goes stale past ~30 minutes or the cron run fails.
- [ ] Fire the alert on purpose: stop the cron, watch the page arrive, turn it back on. An untested alert is a hope, not an alert.

## Done when

- The deliberate cron stop produced an alert within the threshold.
- The health endpoint is in the uptime monitor for both deployments (mainnet + preprod).
