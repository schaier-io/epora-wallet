# API: OpenAPI 3.1 document, generated from zod

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [shared schemas](m3-api-01-shared-schemas.md) and [v1 routes](m3-api-02-v1-routes.md)

Catalyst Milestone 3 asks for "an API + specification for external developers".
There is no spec file in the repo today (VERIFIED: zero matches for `openapi`
under `src`).

The document is generated from the zod schemas by `zod-openapi`, committed to the
repo, served by the app, and checked for staleness in CI (decisions 2 and 10).
Generation is what keeps the spec and the routes from drifting apart.

## The library

`zod-openapi@6.0.2`. VERIFIED from the npm registry and the project README on
2026-08-31: peer range `zod ^4.0.0`, which matches the pinned `4.4.3`; zero
runtime dependencies; supports OpenAPI `3.1.0` and `3.1.1`; annotates through
zod's own `.meta()` with no patching of zod. Install it with
`sfw pnpm add zod-openapi` so Socket Firewall screens the package.

Its `createDocument` takes the hand-written skeleton and the zod schemas
together, and returns the finished document object.

## Steps

- [ ] Add `zod-openapi` and write `scripts/build-openapi.ts`. It calls
      `createDocument` with `openapi: "3.1.0"`, the `info` and `servers`
      skeleton, and the schemas from `src/lib/api/`.
- [ ] Cover every documented path: `stt/lookup`, `pools`, `health`, and the ten
      `tx/*` paths from [the transaction routes task](m3-api-09-tx-routes.md).
- [ ] Document the error shape, the `429` response with `Retry-After`, and the
      rate-limit numbers from [the rate-limit task](m3-api-03-rate-limits.md).
- [ ] State in `info.description` that v1 describes the current shape and that
      the compatibility promise starts at the mainnet beta (decision 11), and
      link the developer docs.
- [ ] Write the output to `docs/api/openapi.json` and commit it.
- [ ] Serve the committed document at `/api/v1/openapi.json`.
- [ ] Add a `pnpm openapi:check` script that regenerates and fails on any
      difference, and run it in frontend CI.

## Done when

- `docs/api/openapi.json` is committed and validates as OpenAPI 3.1.
- `/api/v1/openapi.json` returns it.
- Every documented route, including all ten transaction paths, is in it.
- Changing a schema without regenerating fails CI.
