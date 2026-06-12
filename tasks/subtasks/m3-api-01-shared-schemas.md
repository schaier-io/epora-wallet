# API: hoist shared request/response schemas

Public API task · [Milestone 3](../milestone-3-ui-development.md)

Every route validates input with zod, but the schemas live inline in the route handlers ([stt/lookup](../../code/dApp/src/app/api/stt/lookup/route.ts), pools, proposals). The OpenAPI spec and the round-trip tests need the same shapes — one source or they drift.

## Steps

- [ ] Create `src/lib/api/` and move the request/response schemas + DTO types for the public-facing routes (lookup, pools, proposals) into it.
- [ ] Add response schemas where handlers currently hand-shape JSON — the lookup response (`wallets`, `nextCursor`, `sync`) and the proposal DTOs.
- [ ] Route handlers import from `src/lib/api/`; types come from `z.infer`, not parallel interfaces.
- [ ] No behavior change — existing route and stt-cache tests stay green.

## Done when

- Public route handlers contain no inline zod for request or response shapes.
- One module exports every public request/response type.
- `pnpm test` green without test edits.
