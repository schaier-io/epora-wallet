# Testnet deploy: schedule the indexer

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

`/api/stt/sync` is bearer-secret-gated. `lookup` self-syncs when stale, but only when someone asks, so the cache decays whenever nobody is looking.

## Steps

- [x] A cron hits `/api/stt/sync` roughly every 5 minutes.
  Vercel Cron Job in [`code/dApp/vercel.json`](../../code/dApp/vercel.json) (`GET /api/stt/sync`, `*/5 * * * *`). Vercel sends `Authorization: Bearer $CRON_SECRET`. Set `CRON_SECRET` in the Vercel project to the same value as `STT_SYNC_SECRET`.
- [x] Page budgets: GET has no body, so the indexer defaults apply (`recentHeadPageBudget` 5, `historyBackfillPageBudget` 10). One run stays inside the 300 s function timeout.
- [x] Each run is a Vercel function invocation. Inspect it under Project → Logs, path `/api/stt/sync`. Alerting proper comes in [M5 hardening](m5-harden-01-health-alerts.md).

## Done when

- [ ] 24 hours of green runs; `SttSyncCursor.lastSyncedAt` stays fresh without anyone using the app.
  Blocked on: `CRON_SECRET` in Vercel Production (same value as `STT_SYNC_SECRET`), then merge to `main`.
