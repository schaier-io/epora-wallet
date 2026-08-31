# API: rate-limit the public routes

Public API task · [Milestone 3](../milestone-3-ui-development.md) · decisions in [the decision record](m3-api-00-decisions.md)

Most of this task was already done, which the original version of this file did
not reflect.

VERIFIED on 2026-08-31:
[`rate-limit.ts`](../../code/dApp/src/lib/http/rate-limit.ts) re-exports
`consumePostgresRateLimit as rateLimit`, so the limiter is already backed by
Postgres and already survives a multi-instance deployment. `stt/lookup` uses 60
per minute, `pools` 30 per minute, and `mesh` 120 per minute with a tighter 20
for expensive methods. All three answer `429` with a `Retry-After` header.

## The quota risk, accepted

The build routes fetch the caller's UTxOs from Blockfrost (decision 6), and they
are anonymous (decision 3). Sandro accepted this knowingly and chose to handle
it if it becomes a problem. This task's job is to make the cap tight enough that
the problem is slow to arrive, not to re-open the decision.

## Steps

- [x] Give `/api/v1/tx/*` its own limiter key and a much tighter cap than the
      read routes. Pick the number from the Blockfrost plan's actual limit, not
      from a guess, and write the arithmetic into the task's pull request.
- [x] Make the caps tunable by environment variable, so a quota problem is a
      configuration change and not a deploy.
- [x] Confirm `429` responses carry `Retry-After` on the new routes too.
- [x] Document every limit in the OpenAPI document, per
      [the spec task](m3-api-04-openapi.md).

## Done when

- [x] A flood test against a build route gets `429` and a mock chain client shows
      the provider calls stop at the cap.
- [x] Caps read from the environment, with the current values as defaults.
- [x] The limits appear in the served spec.

## The premise was wrong by about seventy times

The paragraph above says "One HTTP request therefore costs at least one
Blockfrost request against our project key." That is true, and badly
understated.

MEASURED on 2026-08-31 by patching `node:http`/`node:https` and counting real
requests to `blockfrost.io` during one build against preprod:

| Build | Provider requests |
|---|---|
| `lock-funds` | 10 |
| `deploy-reference` | 62 |
| `mint` | 63 |
| `stt-spend` (`use`) | 70 |
| `stt-spend`, with `config.sttSpendReference` set | 24 |

Where it goes: resolving the shared STT reference script calls
`inspectSharedSttReferenceStore`, which lists the reference store address and
then reads each reference script it holds, two requests apiece
(`/scripts/<hash>` and `/scripts/<hash>/cbor`). The store held 89 UTxOs, 12 of
them carrying reference scripts, on the measured day. The builder runs its
prepare step twice to re-estimate execution budgets, so the whole scan happens
twice per build.

Setting `config.sttSpendReference` skips the scan, which is why the same build
costs 24 instead of 70.

## The arithmetic

Blockfrost publishes 10 requests per second, with a burst of 500 cooling off at
10 per second, and limits by source IP
([blockfrost.dev/start-building](https://blockfrost.dev/start-building)). It
answers `402` over the daily limit and `418` for flooding after repeated
`402`/`429`. The deployment is **one IP** to Blockfrost, so the sustained
ceiling for everything the app does is 600 requests per minute, shared.

At 70 requests for the most expensive build:

    per-client: 5 builds/min x 70 =   350 requests/min, ~5.8/s, inside 10/s
    deployment: 25 builds/min x 70 = 1750 requests/min, ~29/s

The deployment cap is a **ban shield**, not a quota guarantee. It is above the
strictly sustainable figure, which at 70 requests per build is only 8 builds per
minute for the entire deployment, browser UI included: too low to serve more
than one active user. 25 per minute is where we choose to shed load rather than
risk the `418` that would take the UI down with the API.

## What changed

Two defects, then the tunable caps.

1. **The per-client bucket was keyed per route.** `clientKey(request,
   \`tx-${options.name}\`)` gave each of the ten build routes its own allowance,
   so one caller could make 100 builds a minute rather than the 10 the
   then-current per-route limit implied. (The shipped per-client limit is 5, set
   later in this task.) At the measured cost that is about 7,000 provider
   requests per minute from a single IP. The bucket
   is now tier-wide: `clientKey(request, "tx-build")`. Both the spec and the
   developer guide already described it as one tier-wide limit, so the code was
   the thing that disagreed.
2. **A per-IP cap cannot protect a shared quota.** Blockfrost sees one IP, so a
   flood spread over many callers passes every per-client check and still spends
   the quota. A second bucket on a fixed key now bounds the deployment, and
   answers with its own message so a caller can tell "you are too fast" from
   "the service is too busy".

[`tx-rate-limit.ts`](../../code/dApp/src/lib/http/tx-rate-limit.ts) holds the
defaults, the arithmetic, and the environment reader. A blank, malformed or
out-of-range value falls back to the default: a typo must not take the build
routes down, and must never widen a cap.

## Evidence

Flood against the live dev server, alternating routes, after the previous window
cleared:

    1 /api/v1/tx/mint              400 retry-after=None
    2 /api/v1/tx/lock-funds        400 retry-after=None
    3 /api/v1/tx/mint              400 retry-after=None
    4 /api/v1/tx/deploy-reference  400 retry-after=None
    5 /api/v1/tx/mint              400 retry-after=None
    6 /api/v1/tx/lock-funds        429 retry-after=60 Too many transaction builds. Try again shortly.
    7 /api/v1/tx/mint              429 retry-after=60 Too many transaction builds. Try again shortly.

Five builds across four routes, then `429`. A per-route bucket would have let
all seven through.

[`tx-route.test.tsx`](../../code/dApp/src/lib/http/tx-route.test.tsx) asserts the
same in CI, with a counter standing in for the chain client. Both behaviours are
mutation-tested: restoring the per-route key fails "counts every build route
into one per-client bucket", and removing the deployment bucket fails "stops a
flood spread across callers at the deployment cap".

`server-only` has no package of its own, because Next resolves that specifier
internally, so vite could not transform any server module. `vitest.config.ts`
now aliases it to an empty stub. This unblocks route-handler tests generally,
which [the spec-conformance task](m3-api-05-spec-tests.md) needs.

## Follow-up, not done here

**The number worth changing is not the cap. It is the 70.** Two cheap
reductions, both outside this task's scope:

- The reference-store scan runs once per build pass, and the builder makes two
  passes. Caching it for the life of one build would remove about 24 requests
  from every STT build.
- The scan cost grows with the store. Every `deploy-reference` ever submitted
  adds a script that every later build by every caller pays to read. Nothing
  prunes it.

Until one of those lands, the honest sustainable throughput is about 8 builds
per minute for the whole deployment.
