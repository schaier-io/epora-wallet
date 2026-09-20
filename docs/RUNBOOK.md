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
| `CRON_SECRET` | Vercel Cron → `GET /api/stt/sync` | Vercel sends this as `Authorization: Bearer …` on the 5-minute indexer cron. Set it to the same value as `STT_SYNC_SECRET`. |
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
5. **`STT_SYNC_SECRET`**: if `CRON_SECRET` is a copy of this value, update both
   in the same change, or the 5-minute Vercel cron starts returning 401.
   Manual `POST /api/stt/sync` callers use this secret. See
   [`tasks/subtasks/m4-deploy-03-sync-cron.md`](../tasks/subtasks/m4-deploy-03-sync-cron.md).
6. **`BLOCKFROST_PREPROD_PROJECT_ID`**: create the new project id in the
   Blockfrost dashboard, set it in Vercel, redeploy, then revoke the old key.

Never commit real secrets. `.env.local` is git-ignored; `.env.example` holds
placeholders only.

---

## 5. Health check

The indexer cron is a Vercel Cron Job in
[`code/dApp/vercel.json`](../code/dApp/vercel.json): `GET /api/stt/sync` every
five minutes. Vercel sends `Authorization: Bearer $CRON_SECRET`. Set
`CRON_SECRET` in the Vercel project to the same value as `STT_SYNC_SECRET`.
GET has no body, so the indexer defaults apply (recent-head 5 pages,
history-backfill 10). HTTP 409 means a previous run still holds the advisory
lock. Treat that as success. Each run is a function invocation under
Project → Logs, path `/api/stt/sync`.

`GET /api/health` ([`src/app/api/health/route.ts`](../code/dApp/src/app/api/health/route.ts))
probes the database and the indexer's sync cursors:

- `200 {"status":"ok",...}` — the database answers `SELECT 1` (2 s timeout) and
  both recurring sync cursors are fresh.
- `503 {"status":"degraded",...}` — the database probe failed, or a required
  sync cursor is stale, never stamped, or unreadable. The route never throws.

Every response carries `checks.database` (`up`/`down`), `checks.indexer`
(`up`/`down`/`unknown`; `unknown` means the cursors were not read because the
database is down), and an `indexer` detail object with each cursor's
`lastSyncedAt`, age in ms, freshness verdict, the history-backfill completion
flag, and `degradedReasons`. `indexer` is `null` when the cursors were not read.

### What each sync cursor attests

| Cursor | Gates health on | Its timestamp attests |
| --- | --- | --- |
| `recent-head` | freshness (stale past 30 min) | a sync run last reached the chain (one page scanned). Not per-wallet freshness. |
| `wallet-reconcile` | freshness (stale past 60 min) | the last *completed* full pass over the wallet collection. A deadline-stopped partial pass keeps the previous stamp. |
| `history-backfill` | nothing (reported only) | nothing once complete: the walk returns early from then on, so its stamp freezes. Only its `completed` flag is reported. |

The thresholds are named constants in
[`src/lib/stt-cache/indexing-freshness.ts`](../code/dApp/src/lib/stt-cache/indexing-freshness.ts),
derived from the sync schedule: the cron fires about every 5 minutes
([`m4-deploy-03-sync-cron`](../tasks/subtasks/m4-deploy-03-sync-cron.md)) and
one run budgets 4 minutes, so the legitimate gap between two stamps is at most
about 9 minutes. The recent-head threshold is 6 missed runs (30 min); the
wallet-reconcile threshold is 12 (60 min), wider because a completed pass may
legitimately span several runs.

### Startup, clock skew, and probe behavior

There is no startup grace period, on purpose. A database with no sync cursors
reports `degraded` ("no completed sync recorded") until the first sync pass
finishes, which is within one cron interval on a healthy deployment. A stamp
slightly in the future is clamped to age 0, so clock skew between instances
cannot read as stale. The probe only reads cursors and makes no chain calls; a
timestamp moves only when a sync run does work, never because the health
endpoint ran.

### Alert rule

Point the uptime monitor at `GET /api/health` and alert on any non-200
response; the 503 body's `degradedReasons` names the failing cursor. Suppress
repeat alerts while the reason is unchanged, so a stalled indexer pages once
instead of on every poll. A `503` with `checks.database: "down"` means
investigate the database or `DATABASE_URL`; with `checks.indexer: "down"`,
investigate the sync cron and the chain provider.

**Monitor verification (still to be executed):** the detection side ships in
code; configuring the monitor for the active Preprod deployment, and the
deliberate-outage drill from
[`m5-harden-01-health-alerts`](../tasks/subtasks/m5-harden-01-health-alerts.md)
(pause the sync cron, record the alert arriving within the 30-minute
threshold, resume, verify recovery) remain open. Record deployment commit,
timing, and observed responses in that task file.

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

### 7.1 Structured logs

Structured logging is emitted as one JSON object per line via
[`src/lib/observability/logger.ts`](../code/dApp/src/lib/observability/logger.ts)
(`logger.info/warn/error`), captured by Vercel's log drains. Use `serializeError`
to attach a thrown value safely — it forwards only `name`/`message`/`stack` and
the `cause` chain, never the error's arbitrary (possibly secret-bearing)
properties.

### 7.2 Sentry error monitoring

The dApp uses `@sentry/nextjs` for browser, server, and API-route error capture
(issue #388). Performance tracing and session replay are deliberately OFF.
Everything is inert without credentials: local development needs no Sentry
setup.

**How errors reach Sentry:**

- Server / API routes: `createTxRoute` catches errors and logs them via
  `logger.error`, whose `reportError` seam forwards to
  `sentry-forward.ts` → `Sentry.captureException`. The error is swallowed into
  a JSON response, so the uncaught-error hook never fires for the same failure.
- Uncaught server errors (App Router, route handlers): the `onRequestError`
  hook in [`src/instrumentation.ts`](../code/dApp/src/instrumentation.ts)
  forwards to `Sentry.captureRequestError`.
- Browser: uncaught errors and promise rejections are captured automatically by
  the client SDK initialized in
  [`src/instrumentation-client.ts`](../code/dApp/src/instrumentation-client.ts).
  Repeated identical events are collapsed by the `dedupeIntegration`.
- Browser caught failures (workspace build/sign/submit errors): the two
  diagnostic seams that `console.error` an unexpected failure also forward the
  live error through `sentry-client-forward.ts` → `Sentry.captureException`,
  gated on the DSN and skipped for expected outcomes, so a real signing
  failure reports even though the UI caught it. Declines and other recognised
  conditions stay unreported. One failure can produce two events, one per
  vantage point: a chain/proxy error is logged by the route that hit it, and
  the same condition surfaces in the browser build's report with UI context;
  dedupe does not collapse them. Stale-snapshot and TTL freshness races also
  classify as unexpected and report; if their volume grows, reclassify them
  as owned messages instead of filtering in the seam.

**Health-route flood control:** the health route forwards its probe-failure
logs (`health.db_probe_failed`, `health.indexer_probe_failed`) to Sentry only
for the first occurrence of a degraded state, any change of that state, and one
re-announcement per 5-minute cooldown while the state stays identical
([`degraded-forward-gate.ts`](../code/dApp/src/app/api/health/degraded-forward-gate.ts)).
Suppressed repeats still reach the platform logs at `info` level with
`sentrySuppressed: true`. The gate is in-process and per-instance: each server
instance keeps only its own last-forwarded record, so N instances can each
forward the same first failure once. It bounds the per-instance flood; it does
not dedupe across instances.

**Redaction** (`src/lib/observability/sentry-scrub.ts`, wired as `beforeSend` /
`beforeBreadcrumb`): routine wallet rejections (the user declined or cancelled a
signature prompt — patterns shared with
`src/lib/utils/wallet-rejection-patterns.ts`) are dropped entirely; cookies,
`Authorization` headers, request bodies, and body-shaped breadcrumb fields are
removed; Cardano addresses (`addr1…`, `addr_test1…`, `stake1…`, `stake_test1…`)
and 64-hex transaction hashes are replaced with `[REDACTED]` in messages,
extras, contexts, and breadcrumbs.

**Environment variables:**

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser (build-time inlined) | Enables client capture; also relaxes CSP `connect-src` for `*.ingest.sentry.io`, `*.ingest.us.sentry.io`, and `*.ingest.de.sentry.io` |
| `SENTRY_DSN` | Server / edge runtime | Enables server and API-route capture |
| `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` | Server / browser | Optional explicit release id |
| `VERCEL_GIT_COMMIT_SHA` / `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | both | Fallback release id (commit SHA) |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | both | Optional; falls back to `NODE_ENV` |
| `SENTRY_AUTH_TOKEN` | Build only: CI or the Vercel project settings | Enables release creation + source-map upload in `next.config.mjs` |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Build only, same places as the token | Sentry org/project slugs for the upload |

Set the DSN variables in the Vercel project (all environments you want
monitored). Local `pnpm dev` / `pnpm build` without them sends nothing and
initializes no Sentry client (the browser SDK is behind a dynamic import, so
credential-free builds do not even download it; the server bundles the module
but never initializes it).

**Source maps:** while `SENTRY_AUTH_TOKEN` is present, `next.config.mjs` wraps
the build with `withSentryConfig`, creates the release, uploads source maps, and
deletes the uploaded maps from the build output. Without the token the build
pipeline is untouched. The token is an org-level secret: keep it in CI secrets
or Vercel project settings, never in the repo, and scope it to
`project:releases` / `project:releases:write` only (add `org:read` if the
upload endpoint asks for it).

**Verifying without production traffic:** set both DSN variables to a test
project's DSN in a non-production deployment, trigger a browser error and an
API-route error, and check the Sentry issue for redacted payloads and a
readable stack trace (the release must exist for symbolication — build with the
auth token set).

Until a DSN is configured, production errors remain visible in Vercel runtime
logs; filter on `"level":"error"`.

