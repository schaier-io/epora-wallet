# Hardening: backups + restore drill

Hardening task · [Milestone 5](../milestone-5-mainnet-closeout.md)

The STT cache is rebuildable from chain — that's the design. Hardening means proving both recovery paths once, with timings, instead of trusting the theory.

## Steps

- [ ] Daily Postgres snapshots on the mainnet database (managed-DB setting, but verify it's actually on and retained).
- [ ] Restore drill: restore a snapshot into a scratch database, point a local app at it, run a lookup. Write down the steps and how long it took.
- [ ] From-zero drill: empty database → `prisma migrate deploy` → history backfill via `/api/stt/sync` (`historyBackfillPageBudget` sized for the host timeout, repeated runs). Time it and note how the duration scales with wallet count.
- [ ] Both writeups go in the repo docs, not a wiki.

## Done when

- Both drills are documented with timings and were actually performed, not described.
- The snapshot schedule is verified against the provider, not assumed.
