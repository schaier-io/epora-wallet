# Testnet deploy: migrations in the release step

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

VERIFIED by source inspection on 2026-09-26 at `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
No tests or deployment drills were run for this task update.

Correction: production migration guidance already exists in the runbook.
The release automation and drift checks still need completion evidence.

## Steps

- [ ] Put `prisma migrate deploy` in the release step before the new version serves traffic. VERIFIED: `code/dApp/package.json:8` still defines build as `prisma generate && next build`. Host release settings were not inspected.
- [ ] Add or record a CI check that rejects a schema change without its migration. Inspection of `.github/workflows/dapp-ci.yml` did not establish such a check.
- [x] Document production migration rules. VERIFIED: `docs/RUNBOOK.md:75-80` requires `prisma migrate deploy` before dependent code, with `db push` confined to isolated CI schemas.

## Remaining verification

- [ ] Show a release that automatically applies a pending migration.
- [ ] Show a schema change without its migration fail CI.
