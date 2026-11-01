# Operations Runbook

Operational procedures for the Epora permission-wallet dApp and its on-chain
contracts. The dApp is a Next.js app (`code/dApp`) with separate **mainnet beta** and **Preprod** deployments;
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
| Chain access | Network-specific Blockfrost + Koios proxy | Server-side only; no key reaches the browser |
| STT reference script | On-chain reference UTxO | Redeployed when validators change (§6) |
| Contract blueprint | `code/smart-contract/plutus.json` | Mirrored into the dApp by `pnpm sync:blueprint` |

On 2026-09-26, [mainnet](https://mainnet.epora.io/api/health) and [Preprod](https://www.epora.io/api/health) returned HTTP 200 with `"database":"up","indexer":"up"`.
This corrects the earlier Preprod-only description. [Milestone 5](../tasks/milestone-5-mainnet-closeout.md#live-deployment-check-2026-09-26) records the measurements and their limits.
Network settings below were inspected on `main` at `d3b5a239`; the closeout branch predates those application changes.

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
| `STT_SYNC_SECRET` | `src/app/api/stt/sync/route.ts` | **VERIFIED:** bearer secret for manual `POST /api/stt/sync`. The visitor route does not use it. |
| `CRON_SECRET` | `src/app/api/stt/sync/route.ts` | **VERIFIED:** accepted as a legacy secret alias for manual POST. Scheduled GET returns 405. |
| `BLOCKFROST_PREPROD_PROJECT_ID` | server chain proxies | Blockfrost preprod access. |
| `BLOCKFROST_MAINNET_PROJECT_ID` | server chain proxies | Blockfrost mainnet access. |
| `DATABASE_URL` | Prisma | **VERIFIED:** runtime Postgres connection string. Deployments can use the pooled URL. |
| `DATABASE_URL_UNPOOLED` | Prisma CLI and STT sync lock | **VERIFIED:** direct Postgres URL. Required for the dedicated sync lock when `DATABASE_URL` uses Neon's pooler. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | client WalletConnect | Optional; CIP-45 pairing. Public by design. |
| `KOIOS_URL` | Koios proxy | Optional endpoint override. |

Full descriptions are in [`code/dApp/README.md`](../code/dApp/README.md) and
[`code/dApp/.env.example`](../code/dApp/.env.example).

**VERIFIED configuration evidence:** the manual route checks
`[getSttSyncSecret(), getCronSecret()]` in
[`sync/route.ts`](../code/dApp/src/app/api/stt/sync/route.ts#L52).
Its GET handler returns `status: 405` before any database work.
The sync lock selects `DATABASE_URL_UNPOOLED` first and rejects a `-pooler.`
hostname in [`sync-lock.ts`](../code/dApp/src/lib/stt-cache/sync-lock.ts#L18).
Prisma runtime still uses `DATABASE_URL` in
[`prisma-adapter.ts`](../code/dApp/src/lib/prisma-adapter.ts#L29).

Checked at `d3b5a239`: the public build-time variable `NEXT_PUBLIC_CARDANO_NETWORK` selects `mainnet`, `preprod`, or `preview`.
It is not a secret. Rebuild when changing it; keep deployment secrets and databases separate.

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
5. **`STT_SYNC_SECRET`**: update manual `POST /api/stt/sync` callers with the
   new secret. If `CRON_SECRET` remains a copy, rotate both values together.
   **VERIFIED:** either configured value authorizes POST through
   `secrets.some((secret) => bearerMatches(candidate, secret))` in
   [`sync/route.ts`](../code/dApp/src/app/api/stt/sync/route.ts#L60).
   Visitor-triggered sync sends neither secret.
6. **`BLOCKFROST_PREPROD_PROJECT_ID`**: create the new project id in the
   Blockfrost dashboard, set it in Vercel, redeploy, then revoke the old key.

Never commit real secrets. `.env.local` is git-ignored; `.env.example` holds
placeholders only.

---

## 5. Health check

**VERIFIED:** Vercel's committed configuration no longer declares a sync cron.
Old `GET /api/stt/sync` requests return 405 before a database connection opens.
Evidence: [`vercel.json`](../code/dApp/vercel.json) contains only `$schema`,
`buildCommand`, and `git`; [`sync/route.ts`](../code/dApp/src/app/api/stt/sync/route.ts#L123)
returns `status: 405`.

**VERIFIED:** the visitor sync controller persists one attempt per network
before chain work and applies a 15-minute cooldown.
It runs one bounded pass and returns explicit history and wallet-pass completion flags.
Evidence: [`visit-sync.ts`](../code/dApp/src/lib/stt-cache/visit-sync.ts),
[`visit-sync-policy.ts`](../code/dApp/src/lib/stt-cache/visit-sync-policy.ts),
`STT_VISIT_SYNC_COOLDOWN_MS = 15 * 60_000`, `writeSyncCursor`, and
`continuationNeeded: !historyComplete || !walletReconcileComplete`.
**INFERRED:** unfinished work can remain incomplete until another eligible visit.
The server does not schedule its own continuation.

**VERIFIED:** `GET /api/health` is application liveness only. It returns
`200 {"status":"ok","ts":"..."}` with `Cache-Control: no-store`.
It does not probe the database, indexer, or chain provider.
Evidence: [`route.ts`](../code/dApp/src/app/api/health/route.ts),
`status: "ok"` and `ts: new Date().toISOString()`.
Use this endpoint for recurring uptime checks so they do not wake Neon.

**VERIFIED:** `GET /api/health/ready` keeps the deep dependency probe.
It runs `SELECT 1`, then reads three indexer cursors if the database answers.
Each probe has a two-second timeout. This request can wake Neon.
Evidence: [`ready/route.ts`](../code/dApp/src/app/api/health/ready/route.ts),
`getPrisma().$queryRaw` with `SELECT 1`, and `readIndexingFreshness(getPrisma(), now)`.
Use it on demand during diagnosis, not as a recurring uptime target.

### Deep readiness response

**VERIFIED:** `/api/health/ready` returns these dependency results:

- `200 {"status":"ok",...}`: the database answers and both gated cursors are fresh.
- `503 {"status":"degraded",...}`: the database fails, or a gated cursor is stale, missing, or unreadable.

Evidence: [`ready/route.ts`](../code/dApp/src/app/api/health/ready/route.ts),
`status: body.status === "ok" ? 200 : 503`.
The body includes `checks.database`, `checks.indexer`, and cursor details.
`indexer` is `null` when the database probe fails.

**VERIFIED:** the cursor checks retain their existing thresholds:

| Cursor | Deep readiness condition | Timestamp meaning |
| --- | --- | --- |
| `recent-head` | stale after 30 minutes | A sync reached the chain. This does not establish full catch-up. |
| `wallet-reconcile` | stale after 60 minutes | The last full wallet collection pass finished. Partial passes keep the previous stamp. |
| `history-backfill` | reported only | Its `completed` flag reports whether the history walk reached the end. |

Evidence: [`indexing-freshness.ts`](../code/dApp/src/lib/stt-cache/indexing-freshness.ts),
`STT_HEALTH_RECENT_HEAD_STALE_MS = 6 * STT_SYNC_SCHEDULE_INTERVAL_MS` and
`STT_HEALTH_WALLET_RECONCILE_STALE_MS = 12 * STT_SYNC_SCHEDULE_INTERVAL_MS`.
The probe reads cursors and makes no chain calls or cursor writes.

**INFERRED:** visitor-only sync leaves cursor ages growing between visits.
A stale-index `503` after idle time describes cached-data readiness, not an application outage.
Evidence: the deep probe compares saved cursor stamps with `now` in
[`indexing-freshness.ts`](../code/dApp/src/lib/stt-cache/indexing-freshness.ts).
Check the response reasons and the last eligible visit before investigating a sync failure.
Do not use the old missed-cron alert rule for this mode.

### Monitor verification

**REPORTED:** the previous runbook named BetterStack as the monitor of record.
Its configuration and actual request cadence remain unverified in this change.
Evidence: [`m5-harden-01-health-alerts`](../tasks/subtasks/m5-harden-01-health-alerts.md)
contains the outstanding monitor configuration and outage drill.
No monitor configuration changes form part of this route split.
Verify that any recurring monitor targets `/api/health`, and run deep readiness only when needed.

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

**VERIFIED: Deep-readiness flood control.** `/api/health/ready` forwards its probe-failure
logs (`health.db_probe_failed`, `health.indexer_probe_failed`) to Sentry only
for the first occurrence of a degraded state, any change of that state, and one
re-announcement per 5-minute cooldown while the state stays identical
([`degraded-forward-gate.ts`](../code/dApp/src/app/api/health/degraded-forward-gate.ts)).
Suppressed repeats still reach the platform logs at `info` level with
`sentrySuppressed: true`. The gate is in-process and per-instance: each server
instance keeps only its own last-forwarded record, so N instances can each
forward the same first failure once. It bounds the per-instance flood; it does
not dedupe across instances. Evidence: `createDegradedForwardGate` keeps
`let lastForwarded: DegradedForwardRecord | null = null` in the linked source.

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
