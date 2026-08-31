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

- [x] Add `zod-openapi` and write `scripts/build-openapi.ts`.
- [x] Cover every documented path: `health`, `pools`, `stt/lookup`, and the ten
      `tx/*` paths. Thirteen in total.
- [x] Document the error shape, the `429` response with `Retry-After`, and the
      rate-limit numbers.
- [x] State the versioning promise in `info.description` and link the developer
      docs.
- [x] Write the output to `docs/api/openapi.json` and commit it.
- [x] Serve it at `/api/v1/openapi.json`.
- [x] Add `pnpm openapi:check` and run it in frontend CI.

## What landed

`zod-openapi@6.0.2`, installed through Socket Firewall. VERIFIED at install:
`latest` resolved to exactly 6.0.2, peer range `zod ^4.0.0`, matching the pinned
4.4.3.

[`lib/api/openapi.ts`](../../code/dApp/src/lib/api/openapi.ts) builds the
document from the same zod schemas the routes validate with, so it cannot
describe a shape the routes do not accept.
[`scripts/build-openapi.ts`](../../code/dApp/scripts/build-openapi.ts) writes or
checks it, mirroring `sync-blueprint.mjs`, which guards the contract blueprint
the same way.

The served route calls the generator rather than reading the committed file, so
what the app serves cannot drift from what it validates. `openapi:check`
guarantees the committed copy is the same document, which makes the two
interchangeable by construction.

### Naming the recursive schemas

Plutus data is two mutually recursive schemas, and both needed their `id` in a
different place. `ConstrData` carries its id on the object the `z.lazy` wrapper
resolves to; `PlutusData` carries its id on the wrapper itself, because its union
is inlined. Placing either one wrongly produced an auto-generated `__schema0` in
the output. VERIFIED: the committed document has 35 named components and no
auto-generated names.

### Validation

VERIFIED on 2026-08-31 with `redocly lint` (via `pnpm dlx`, not added as a
dependency): **"Your API description is valid."**

Getting there fixed two real gaps. Every operation now has an `operationId`,
which client generators need. And the document declares `security: []`, which is
true today: every route is public and rate-limited by client address, and saying
so explicitly beats leaving it unstated. Wallet-signature login is
[separate, later work](m3-auth-01-wallet-login.md).

One warning is left and is deliberate: `operation-4xx-response` on
`/api/health`, which returns only 200 or 503. Documenting a 4xx it never returns
would make the spec less accurate, not more.

### The drift check really fails

Not assumed, measured. `pnpm openapi:check` exits `1` and names the fix when a
schema description is changed without regenerating, exits `1` when the committed
document is absent, and exits `0` on a clean tree.

## Done when

- [x] `docs/api/openapi.json` is committed and validates as OpenAPI 3.1.
- [x] `/api/v1/openapi.json` returns it. VERIFIED: the served bytes parse equal
      to the committed file.
- [x] Every documented route, including all ten transaction paths, is in it.
      Thirteen paths, 35 components.
- [x] Changing a schema without regenerating fails CI. Measured, above.

Carried to [the developer docs](m3-api-06-dev-docs.md): `info.description` links
`docs/api/README.md`, which does not exist yet. That task must create it, or the
published spec carries a dead link.
