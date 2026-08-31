# API: hoist shared request/response schemas

Public API task · [Milestone 3](../milestone-3-ui-development.md) · decisions in [the decision record](m3-api-00-decisions.md)

Every route validates input with zod, but the schemas live inline in the route
handlers ([stt/lookup](../../code/dApp/src/app/api/stt/lookup/route.ts), pools).
Decision 2 makes those schemas the single source for the OpenAPI document, so
they have to leave the handlers first. Nothing else in this milestone can start
until they have.

`pools` hand-shapes its JSON today and has no response schema at all. Response
schemas are not optional here: the spec is generated from them.

## Steps

- [x] Create `src/lib/api/` and move the request schemas for the documented
      routes into it: `stt/lookup`, `pools`, `health`.
- [x] Add the response schemas that do not exist yet. `lookup` returns
      `wallets`, `nextCursor` and `sync`; `pools` returns pool info plus
      metadata; `health` returns `status`, `checks` and `ts`.
- [x] Add the shared error schema. The routes already answer `{ "error": string }`
      on 400, 413, 429 and 500, so this describes what is there, it does not
      change it.
- [x] Annotate each schema with zod's native `.meta()`: `id` for the schemas that
      become reusable components, plus `description` and `example`. This is what
      `zod-openapi` reads in [the spec task](m3-api-04-openapi.md).
- [x] Route handlers import from `src/lib/api/`. Types come from `z.infer`, never
      from a parallel hand-written interface.
- [x] No behaviour change. The existing route tests stay green without edits.

Proposals schemas stay where they are. Decision 4 keeps that surface out of the
public spec.

## Done when

- The documented route handlers contain no inline zod for request or response shapes.
- One module exports every documented request and response type.
- Every exported schema carries a `.meta()` description.
- `pnpm test` and `pnpm test:components` pass without test edits.
