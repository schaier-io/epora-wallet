# Testnet deploy: host, database, secrets

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md)

Nothing is hosted today — no vercel.json, no Dockerfile, [next.config.mjs](../../code/dApp/next.config.mjs) near-empty. The app already targets preprod, so this is hosting work, not porting work.

## Steps

- [ ] Pick the host and write down why. Vercel is the least friction for Next 16 + managed Postgres; a plain VPS works too.
- [ ] Provision Postgres; set the secrets in the host's env — `BLOCKFROST_PREPROD_PROJECT_ID`, `DATABASE_URL`, `STT_SYNC_SECRET`, `PROPOSAL_AUTH_SECRET`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` ([.env.example](../../code/dApp/.env.example)). No `.env` file in the deploy.
- [ ] `PROPOSAL_AUTH_SECRET` has a dev fallback in [auth.ts](../../code/dApp/src/lib/proposals/auth.ts) — verify production refuses to run on it; make it refuse if it doesn't. Test by unsetting the var.

## Done when

- The app boots on the host against the production database.
- Unsetting `PROPOSAL_AUTH_SECRET` in production fails loudly instead of silently using the dev secret.
