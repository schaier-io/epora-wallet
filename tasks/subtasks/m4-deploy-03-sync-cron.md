# Testnet deploy: schedule the indexer

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

`/api/stt/sync` is bearer-secret-gated and nothing calls it on a schedule. `lookup` self-syncs when stale — but only when someone asks, so the cache decays whenever nobody is looking.

## Steps

- [ ] A cron hits `POST /api/stt/sync` with the `STT_SYNC_SECRET` bearer roughly every 5 minutes — host cron (e.g. Vercel cron) or a GitHub Actions schedule, whichever the hosting choice makes natural.
- [ ] Pick the page budgets in the request body (`recentHeadPageBudget`, `historyBackfillPageBudget`) so a single run stays well inside the host's function timeout.
- [ ] Log/keep each run's response somewhere inspectable — alerting proper comes in [M5 hardening](m5-harden-01-health-alerts.md), but the cron's history should be checkable now.

## Done when

- 24 hours of green runs; `SttSyncCursor.lastSyncedAt` stays fresh without anyone using the app.
