# API: the decisions behind the public v1 surface

Public API task · [Milestone 3](../milestone-3-ui-development.md)

The other `m3-api-*` files describe work. This file records why that work has the
shape it has, so a later reader does not re-open settled questions or repeat a
measurement.

Provenance tags used below. **VERIFIED** means it was run or read in the repo and
the evidence is quoted. **DECIDED** means Sandro chose it. **INFERRED** means it
was reasoned from something else and is not yet measured.

## What was already true (VERIFIED, 2026-08-31)

Four claims in the original task files were stale. They shrink the work.

1. Rate limiting exists and is already Postgres-backed.
   [`rate-limit.ts`](../../code/dApp/src/lib/http/rate-limit.ts) re-exports
   `consumePostgresRateLimit as rateLimit`. `stt/lookup` uses 60 per minute,
   `pools` 30 per minute, `mesh` 120 per minute with 20 for expensive methods.
   All three return `429` with a `Retry-After` header. The open question in
   [rate limits](m3-api-03-rate-limits.md) about a memory store versus Postgres
   was therefore already answered.
2. zod is `4.4.3` and `z.toJSONSchema` is a function. Checked with
   `node -e "console.log(typeof require('zod').toJSONSchema)"`, which printed
   `function`.
3. The error shape is already uniform across the public routes: a JSON body of
   `{ "error": string }` on 400, 413, 429 and 500.
4. Genuinely absent: no `src/lib/api/`, no `src/app/api/v1/`, and zero matches
   for `openapi` under `src`.

Two structural facts decided the transaction work.

5. All nine transaction-builder files that accept a Mesh `BrowserWallet` reach it
   through one function, `setupTransaction` at
   [`internals/core.ts:56`](../../code/dApp/src/lib/mesh/transactions/internals/core.ts).
   That function is the only place UTxOs, change address and collateral are
   resolved. Confirmed by `grep -rln setupTransaction src/lib/mesh/transactions/*.ts`,
   which lists `consolidate-utxos`, `deploy-shared-reference`, `mint-state-token`,
   `set-intended-stake-credential`, `lock-funds`, `wallet-governance`,
   `wallet-spend`, `stt-spend` and `wallet-withdraw`.
6. `BuildResult` at [`types/contracts.ts:259`](../../code/dApp/src/lib/types/contracts.ts)
   is `{ txHex, preview, estimatedFeeLovelace?, executionUnits?, warnings? }`.
   It is already a usable HTTP response body, so the build routes return it
   unchanged rather than defining a second shape.

## Decisions

**1. Destination (DECIDED).** Catalyst acceptance criterion 2 satisfied on
`main`: a versioned v1 API, an OpenAPI 3.1 document served by the app and
checked in CI, and developer documentation an outsider can follow. The scope is
what the milestone asks for, not a general-purpose platform API.

**2. The spec is generated from zod by `zod-openapi` (DECIDED).** Not
hand-written, and not zod's native `z.toJSONSchema`. `zod-openapi@6.0.2` has a
`zod ^4.0.0` peer range matching our `4.4.3`, has zero runtime dependencies,
targets OpenAPI `3.1.0` and `3.1.1`, and annotates through zod's own `.meta()`
rather than patching zod (VERIFIED from the npm registry and the project README
on 2026-08-31). The alternative `@asteasolutions/zod-to-openapi@9.1.0` also
supports zod 4 but adds an `openapi3-ts` dependency. One source of truth for
request and response shapes, so the spec cannot drift from the routes.

**3. The public routes stay anonymous (DECIDED, with an accepted risk).** No
bearer token and no API key in v1. The existing per-IP Postgres limiter is the
only abuse control, and the transaction-build routes fetch through Blockfrost,
which spends our project quota.

The risk was raised and accepted: an anonymous build route turns one HTTP
request into at least one provider request, which is the same property that
keeps `/api/mesh` internal and unversioned. Sandro's call was to ship it on
Blockfrost with the existing limiter and handle quota problems if they appear.
Recorded so the reasoning is visible if it does.

Routing the fetch through Koios instead, or gating the build routes, were the
two rejected alternatives. Either remains available without redesign.

**4. `proposals` is excluded from the spec entirely (DECIDED).** It stays
internal alongside `mesh` and `stt/sync`. It is session-authed and specific to
this app, so it is not part of what an external wallet team integrates against.

**5. There is a server-side transaction-building API (DECIDED).** The caller
posts a described action and receives an unsigned transaction to sign with its
own wallet. This is what makes criterion 2's phrase "interact with the smart
contract" true of the HTTP surface rather than only of the client library.

**6. The server fetches the caller's UTxOs from chain by address (DECIDED).**
The request carries an address, not a UTxO set. Blockfrost backs the fetch, per
decision 3. The rejected alternative was to have the caller supply UTxOs, change
address and collateral in the body, which would have made the route a pure
computation with no provider cost.

**7. All eighteen operations are covered (DECIDED).** The nine `buildSttSpendTx`
actions (`use`, `renew-proof-of-life`, `update-state`,
`manage-streaming-payments`, `use-allowance`, `use-beneficiary`,
`payout-streaming-payment`, `cancel-streaming-payment`, `remove-access-index`)
plus `mint`, `lock-funds`, `wallet-spend`, `wallet-withdraw`, `consolidate`,
`set-stake-credential`, `vote`, `publish` and `deploy-reference`. Full parity
between the HTTP API and the app.

**8. One seam is widened, nothing is duplicated (DECIDED).** `setupTransaction`
takes a narrow wallet-source interface instead of a Mesh `BrowserWallet`. A
`BrowserWallet` satisfies it structurally, so the browser path is unchanged, and
a Blockfrost-backed server implementation satisfies it too. Per finding 5 this
single change carries all eighteen operations to the server. Writing server-side
twins was rejected: eighteen operations implemented twice will drift.

**9. Ten transaction paths, one per builder (DECIDED).** `/api/v1/tx/stt-spend`
carries the nine-action discriminator the builder already has, and the other nine
builders get one path each. The HTTP surface mirrors the module layout, so there
is no second structure to keep in sync. A single `/tx/build` endpoint hiding an
eighteen-branch union was rejected as unreadable in rendered documentation.

**10. The document is generated, committed, served and checked (DECIDED).** A
script emits it from the zod schemas into `docs/api/openapi.json`; the file is
committed; `/api/v1/openapi.json` serves it; CI regenerates and fails when the
committed copy is stale. The committed file is what the Catalyst proof links, in
the same way the Milestone 2 proof linked files on `main`.

**11. v1 means the current shape; stability is promised at mainnet (DECIDED).**
The spec and the developer docs say plainly that the compatibility promise begins
with the Milestone 5 mainnet beta. Freezing eighteen operations that nobody
outside the project has used yet was rejected.

**12. There is no separate planning map (DECIDED).** These decisions live in
`tasks/subtasks/` beside the work, not in a parallel tracker.

## Open, not yet decided

- Whether `/api/v1/tx/*` needs its own rate-limit tier separate from the read
  routes, and what the numbers are. See [rate limits](m3-api-03-rate-limits.md).
  INFERRED: it does, because a build costs a provider request and a cache read
  does not.
- Whether the Blockfrost address-UTxO fetch returns everything `setupTransaction`
  needs, in particular collateral selection, which the browser path takes from
  the connected wallet. Not measured. See [server wallet source](m3-api-08-server-wallet-source.md).
