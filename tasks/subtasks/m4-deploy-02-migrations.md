# Testnet deploy: migrations in the release step

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

Real migrations exist ([prisma/migrations/](../../code/dApp/prisma/migrations/)), but `pnpm build` only runs `prisma generate` — nothing applies migrations on deploy, and dev habits (`db push`) would silently drift production.

## Steps

- [ ] Put `prisma migrate deploy` in the release step, before the new version serves traffic.
- [ ] CI drift check: `prisma migrate diff --from-migrations --to-schema-datamodel` (or equivalent) so a schema change without a migration fails CI instead of failing the deploy.
- [ ] Write the rule down in the frontend README: production is `migrate deploy` only; `db push` is for local/test schemas.

## Done when

- A deploy with a pending migration applies it automatically.
- A schema edit without a migration file fails CI.
