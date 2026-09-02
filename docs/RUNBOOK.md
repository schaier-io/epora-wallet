# Operations Runbook

Operational procedures for the Epora permission-wallet dApp and its on-chain
contracts. The dApp is a Next.js app (`code/dApp`) targeting Cardano **preprod**;
the validators live in `code/smart-contract`. Design rationale is in the
[whitepaper](../whitepaper/whitepaper.pdf); this document is the *how-to-operate*
companion. Milestone-level deploy notes live under
[`tasks/subtasks/`](../tasks/subtasks/) (the `m4-deploy-*` and
`m4-fixloop-03-contract-redeploys` files) — this runbook is the single entry
point that ties them together.

---

## 1. Topology

| Piece | Where | Notes |
| --- | --- | --- |
| dApp | Vercel (Next.js) | Production auto-deploys from `main`; PR previews on `/deploy` comment |
| Database | Postgres (Prisma 7, `@prisma/adapter-pg`) | Schema in `code/dApp/prisma/schema.prisma` |
| Chain access | Blockfrost (preprod) + Koios proxy | Server-side only; no key reaches the browser |
| STT reference script | On-chain reference UTxO | Redeployed when validators change (§6) |
| Contract blueprint | `code/smart-contract/plutus.json` | Mirrored into the dApp by `pnpm sync:blueprint` |

---

## 2. Deploy (dApp)

**Production** auto-deploys: a push or merge to `main` builds and deploys
through Vercel's Git integration. Every other branch has automatic deployments
disabled in [`code/dApp/vercel.json`](../code/dApp/vercel.json)
(`git.deploymentEnabled`: `"**": false` with `"main": true`), so branch pushes
and pull requests create no deployments on their own.

**Previews** run on request: comment `/deploy` on an open pull request that
targets `dev` or `main`. The
[`dapp-preview-deploy` workflow](../.github/workflows/dapp-preview-deploy.yml)
deploys the PR head with the Vercel CLI and posts the preview URL as a comment.
It only runs for repository collaborators (OWNER, MEMBER, COLLABORATOR) and
needs three repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID`. Create the token on the Vercel account tokens page; copy
the two IDs from `code/dApp/.vercel/project.json` after `vercel link`. To
redeploy the same commit as production without a push, use the dashboard:
Deployments → Redeploy.

Pre-deploy gates run in CI ([`.github/workflows/dapp-ci.yml`](../.github/workflows/dapp-ci.yml)):
`typecheck` → `lint` (zero warnings) → `test` (with a throwaway Postgres) →
`audit` (advisory scan) → `build` (gated on `verify`). Do not merge to `main`
with any of these red.

Deploy checklist:

1. Confirm CI is green on the PR.
2. Confirm the Vercel project has all required env vars for **Production**
   (see §4). Missing secrets fail at request time, not build time.
3. Apply any pending database migration **before** promoting (see §3).
4. Merge to `main`; watch the Vercel deployment to "Ready".
5. Smoke-test: `curl https://<host>/api/health` returns `{"status":"ok"}` (§5),
   then walk the guided `/user` flow (mint → send → refresh timer). Detailed
   smoke evidence steps: [`tasks/subtasks/m4-deploy-05-smoke-evidence.md`](../tasks/subtasks/m4-deploy-05-smoke-evidence.md).

**Rollback:** in the Vercel dashboard, promote the previous known-good
deployment (instant, atomic). If the rollback is due to a database migration,
also reconcile the schema (§3 → Rollback).

---

## 3. Database & migrations

Migrations are committed under `code/dApp/prisma/migrations/` and are the source
of truth for the schema. See
[`tasks/subtasks/m4-deploy-02-migrations.md`](../tasks/subtasks/m4-deploy-02-migrations.md).

- **Local dev:** `pnpm prisma:migrate` (`prisma migrate dev`) to create/apply a
  migration; `pnpm prisma:push` for a throwaway sync.
- **Production:** run `prisma migrate deploy` against the production
  `DATABASE_URL` **before** the code that depends on the new columns goes live.
  `migrate deploy` only applies already-committed migrations — never generates
  new ones — so it is safe to run from CI/CD or a one-off job.
- **CI tests** use `prisma db push` against an isolated `stt_test` schema, so
  they never touch application data.

**Rollback:** Prisma has no automatic down-migrations. To roll back schema,
write a new forward migration that reverses the change, or restore from a
database backup taken before the deploy. Take a backup before any destructive
migration (column/table drops).

---

## 4. Secrets & rotation

| Secret | Consumed by | Purpose |
| --- | --- | --- |
| `PROPOSAL_AUTH_SECRET` | `src/lib/proposals/auth.ts` | HMAC for multi-sig proposal sign-in nonces + session cookies. **Required in production** (a fixed dev fallback is used only when unset locally). |
| `STT_SYNC_SECRET` | `src/app/api/stt/sync/route.ts` | Bearer secret guarding the background STT sync route. |
| `BLOCKFROST_PREPROD_PROJECT_ID` | server chain proxies | Blockfrost preprod access. |
| `DATABASE_URL` | Prisma | Postgres connection string. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | client WalletConnect | Optional; CIP-45 pairing. Public by design. |
| `KOIOS_URL` | Koios proxy | Optional endpoint override. |

Full descriptions are in [`code/dApp/README.md`](../code/dApp/README.md) and
[`code/dApp/.env.example`](../code/dApp/.env.example).

### Rotation procedure

`PROPOSAL_AUTH_SECRET` and `STT_SYNC_SECRET` are symmetric secrets — rotating
them invalidates outstanding artifacts, so rotate deliberately:

1. Generate a new value: `openssl rand -hex 32`.
2. Update it in the Vercel project's **Production** (and Preview, if used) env.
3. Redeploy (env changes need a new deployment to take effect).
4. **`PROPOSAL_AUTH_SECRET`**: rotation invalidates all active proposal sessions
   — signers must re-authenticate with their wallet. It does **not** affect
   already-collected on-chain witnesses (those are keyed by tx body hash, not
   this secret). Announce a maintenance window if signers are mid-flow.
5. **`STT_SYNC_SECRET`**: update the secret in the caller of `/api/stt/sync`
   (the sync cron/job — see [`tasks/subtasks/m4-deploy-03-sync-cron.md`](../tasks/subtasks/m4-deploy-03-sync-cron.md))
   in the same change, or sync will start returning 401.
6. **`BLOCKFROST_PREPROD_PROJECT_ID`**: create the new project id in the
   Blockfrost dashboard, set it in Vercel, redeploy, then revoke the old key.

Never commit real secrets. `.env.local` is git-ignored; `.env.example` holds
placeholders only.

---

## 5. Health check

`GET /api/health` ([`src/app/api/health/route.ts`](../code/dApp/src/app/api/health/route.ts)):

- `200 {"status":"ok","checks":{"database":"up"}}` — app is up and can reach Postgres.
- `503 {"status":"degraded","checks":{"database":"down"}}` — app is up but the
  database probe failed (or timed out after 2s). The route never throws.

Point an uptime monitor at it and alert on non-200. A `503` means investigate
the database / `DATABASE_URL`, not the app process.

---

## 6. Contract redeploy

When validators in `code/smart-contract` change, the compiled blueprint and the
on-chain STT reference script must be refreshed. See
[`tasks/subtasks/m4-fixloop-03-contract-redeploys.md`](../tasks/subtasks/m4-fixloop-03-contract-redeploys.md)
and [`tasks/subtasks/m4-deploy-04-reference-store.md`](../tasks/subtasks/m4-deploy-04-reference-store.md).

1. Rebuild + sync the blueprint into the dApp:
   `pnpm -C code/smart-contract sync` (runs the toolchain guard, `aiken build`,
   then `pnpm -C code/dApp sync:blueprint`). CI's `blueprint-autosync` workflow
   also does this on push.
2. A validator change produces **new script hashes** → a new wallet address and
   a new STT reference script. Existing wallets remain bound to the old
   validators; only newly minted wallets use the new hashes.
3. Deploy the new shared STT reference script on-chain and confirm the dApp
   points at it before minting under the new validators.
4. Verify: `pnpm -C code/smart-contract check` (must be `0 warnings`, unchanged
   check count for a behavior-preserving change — see the contract
   [CLAUDE.md](../code/smart-contract/CLAUDE.md) rule 8).

---

## 7. Observability

Structured logging is emitted as one JSON object per line via
[`src/lib/observability/logger.ts`](../code/dApp/src/lib/observability/logger.ts)
(`logger.info/warn/error`), captured by Vercel's log drains. Use `serializeError`
to attach a thrown value safely — it forwards only `name`/`message`/`stack` and
the `cause` chain, never the error's arbitrary (possibly secret-bearing)
properties.

There is **no external error tracker wired in yet.** The single seam to add one
is `reportError` at the bottom of `logger.ts`: drop
`Sentry.captureException(...)` there and every `logger.error` call forwards
automatically — no call-site changes. Until then, production errors are visible
only in Vercel runtime logs; filter on `"level":"error"`.
