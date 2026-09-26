# Testnet deploy: schedule the indexer

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

VERIFIED by source inspection on 2026-09-26 at `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
No tests or deployment drills were run for this task update.

Correction: the earlier merge blocker is stale. The cron configuration is on `origin/main`.
A healthy sample does not establish 24 hours of unattended operation.

## Completed

- [x] Configure `GET /api/stt/sync` every five minutes. VERIFIED: `code/dApp/vercel.json:10-15` defines `*/5 * * * *`.
- [x] Document authentication, page budgets, and invocation logs. VERIFIED: `docs/RUNBOOK.md:130-137` records `CRON_SECRET`, the 5/10 page budgets, and the Vercel log path.
- [x] Record a healthy deployment sample. REPORTED: `docs/testnet-feedback.md:150` records HTTP `200`, database/indexer `up`, and `recentHeadFresh: true` on 2026-09-22.

## Remaining verification

- [ ] Record 24 hours of successful unattended runs and fresh recurring cursors.
  Check both `recent-head` and `wallet-reconcile`. VERIFIED: `docs/RUNBOOK.md:153-159` distinguishes their timestamps from completed history backfill.
