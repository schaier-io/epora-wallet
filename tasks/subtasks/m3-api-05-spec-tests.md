# API: prove the spec matches the routes

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [the spec](m3-api-04-openapi.md)

A spec nobody checks is wrong within a month. Generation (decision 2) removes
most of that risk, because the schemas in the document are the schemas the routes
validate against. It does not remove all of it: a handler can still return
something its own response schema does not describe.

Two different checks, and it is worth being clear which failure each catches.

- The staleness check in [the spec task](m3-api-04-openapi.md) catches a schema
  that changed without the committed document being regenerated.
- These tests catch a handler whose real response does not match the schema it
  claims. Generation cannot catch that, because it never runs the handler.

## Steps

- [x] One test per documented endpoint. Call the route handler against a seeded
      database, using the existing
      [stt-cache test helpers](../../code/dApp/src/lib/stt-cache/test-helpers.ts),
      which already build fixtures and a mock chain client.
- [x] Parse each response with its own zod schema from `src/lib/api/`. A parse
      failure is a test failure. No second validator is needed, because the
      schema is the contract.
- [x] Cover the unhappy paths the spec documents: validation errors, `413`,
      `429`, and the `lookup` rule that exactly one of `paymentKeyHash` or
      `address` is given.
- [x] Cover the transaction routes with a mock chain client, asserting the
      response parses as `BuildResult` and that a bad action is rejected.
- [x] Wire the tests into `pnpm test` so frontend CI runs them.

## What was written

Four files, split by what each one can prove.

| File | Runner | Proves |
|---|---|---|
| `src/lib/api/spec-coverage.test.ts` | node:test | The document's path set is the route set on disk, both directions. |
| `src/lib/api/response-conformance.test.ts` | node:test | Real `lookupSttWallets` output parses with the published schema; health and pools bodies too. |
| `src/app/api/v1/tx-conformance.test.tsx` | vitest | A real build, through the real handler, returns a body that parses as `BuildResult`; the documented failures return the documented statuses. |
| `src/app/api/v1/stt/lookup-conformance.test.tsx` | vitest | The one public read that takes a body returns the documented statuses for its failures. |

The split by runner is the repo's existing one: `*.test.ts` on node:test via tsx,
`*.test.tsx` on vitest. Route handlers need `vi.mock`, so they are `.tsx`.

Both are in CI already: `.github/workflows/dapp-ci.yml:86` runs `pnpm test` and
`:90` runs `pnpm test:components`, against the workflow's own Postgres service.

## What the spec covers, and what each endpoint's test is

13 paths, 13 operations (VERIFIED, by reading `docs/api/openapi.json`).

| Endpoint | Happy path | Failures |
|---|---|---|
| `GET /api/health` | both documented bodies parse | a status the spec does not list is rejected |
| `GET /api/v1/pools` | all-null pool and populated pool parse | lovelace sent as a number is rejected |
| `POST /api/v1/stt/lookup` | seeded DB, populated + empty + cursor pages parse | 400 malformed, 400 schema, 400 address, 413, 429 |
| `POST /api/v1/tx/lock-funds` | **a real build**, parses as `BuildResult` | see below |
| the other nine `tx` routes | not built (see the limit below) | 400 naming the field, per route |

Every `/api/v1/tx/*` route is asserted to reject an empty body with a message
that names a field, and the route list in the test is itself asserted against
the spec, so a new build route cannot be added without a test landing with it.

## Defect this ticket found

**Malformed JSON returned `500`, not `400`.** `readBoundedJson` ended in a bare
`JSON.parse(body)`. A `SyntaxError` is indistinguishable from one thrown
anywhere else in a route's `try` block, so every route fell through to its
generic handler: status `500`, body `{"error":"Transaction build failed."}`, and
an `logger.error` line for what is entirely the caller's mistake.

The developer guide's own table says `400` means "Your request is invalid".

Fixed once, in the shared path: `readBoundedJson` now throws a typed
`InvalidJsonError`, and the two public entry points (`lib/http/tx-route.ts`,
`app/api/v1/stt/lookup/route.ts`) map it to `400 {"error":"Request body is not
valid JSON."}`. Routes outside the public v1 surface keep their previous
behaviour: they never referenced the new type, so nothing changed for them.

## The one limit worth stating plainly

Only `lock-funds` is *built* in a test. The other nine builders need on-chain
state a mock cannot honestly fabricate: the state-token UTxO at the STT script
address, the wallet's own UTxOs, a deployed reference script. A mock that
returned invented UTxOs would prove the mock parses, not that the route works.
Those nine are covered at the route level (schema, error mapping, rate limit)
and end to end by [the tx-routes ticket](m3-api-09-tx-routes.md), which builds
each one against preprod for real.

## Evidence

Every assertion below was mutation-tested: the source was broken, the named test
was observed to fail, and the source was restored.

| Mutation | Result |
|---|---|
| removed the `InvalidJsonError` mapping from both entry points | 2 failed: `answers malformed JSON with 400, not a logged 500` (VERIFIED) |
| returned `estimatedFeeLovelace` as a number from the lock-funds builder | 1 failed: `expected string, received number` at `estimatedFeeLovelace` (VERIFIED) |
| dropped `/api/v1/tx/vote` from the test's route list | 1 failed: `is in this file's list, so none goes untested` (VERIFIED) |
| made `describeZodIssue` always return its generic fallback | 13 failed (VERIFIED) |
| disabled the lookup route's rate-limit branch | 1 failed: `answers 429 with Retry-After and the documented body` (VERIFIED) |
| added an undocumented route file | spec-coverage failed (VERIFIED, recorded when written) |
| added a phantom path to the document | spec-coverage failed (VERIFIED, recorded when written) |
| drifted `userCount` to a string | response-conformance failed (VERIFIED, recorded when written) |

Gate, all VERIFIED in this session:

```
pnpm lint        clean
pnpm typecheck   clean
pnpm test        ℹ tests 544 / ℹ pass 544 / ℹ fail 0
pnpm test:components   Test Files 14 passed (14) / Tests 53 passed (53)
pnpm openapi:check     OpenAPI document is in sync
pnpm build       clean
```

One trap is worth recording, because it cost time and will recur. jsdom replaces
the `Uint8Array` global, so a `Buffer` created inside Mesh fails Mesh's own
`instanceof Uint8Array` check and `applyParamsToScript` throws "Unsupported
Plutus version or invalid Plutus script bytes". Any vitest file that builds a
transaction needs the `// @vitest-environment node` docblock.

## Done when

- [x] Changing a response shape without changing its schema fails CI.
- [x] Error responses are asserted, not only the happy path.
- [x] Every documented endpoint has at least one test.
