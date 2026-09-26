# Testnet deploy: host, database, secrets

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

VERIFIED by source inspection on 2026-09-26 at `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
No tests or deployment drills were run for this task update.

Correction: the earlier statement that nothing was hosted was stale.
`code/dApp/vercel.json:10` defines the deployed indexer cron.
REPORTED: `docs/testnet-feedback.md:149-150` records the public app and a successful database health probe on 2026-09-22.

## Completed

- [x] Select Vercel and document deployment configuration. VERIFIED: `docs/RUNBOOK.md:89-137` describes environment configuration and the Vercel cron.
- [x] Refuse the development authentication secret in production. VERIFIED: `code/dApp/src/lib/env/server-env.ts:87-118` rejects missing, short, and known weak secrets. Existing tests cover these cases in `server-env.test.ts:58-77`.

## Remaining verification

- [ ] Record the deployed environment inventory without exposing values. Confirm database, provider, sync, authentication, and optional WalletConnect configuration.
- [ ] Record a production-mode check with `PROPOSAL_AUTH_SECRET` unset in an isolated deployment. Source inspection does not prove the deployed configuration.
