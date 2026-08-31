# API: pin the v1 surface and version the routes

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [shared schemas](m3-api-01-shared-schemas.md)

No route carries a version today, so renaming anything later breaks whoever built
against it. Freeze the surface behind `/api/v1/` first, then document it.

## The surface (decided, see [the decision record](m3-api-00-decisions.md))

Public and documented:

- `POST /api/v1/stt/lookup`: wallet discovery, state and activity.
- `GET /api/v1/pools`: stake-pool lookup by bech32 pool id.
- `GET /api/health`: liveness and database readiness. Documented, but
  deliberately left unversioned. It is an operations probe, not part of the
  developer contract, and [the runbook](../../docs/RUNBOOK.md) uses it as the
  deploy smoke test. A probe that moves between API versions is a probe that
  breaks a deploy.
- Ten `POST /api/v1/tx/*` transaction-build paths, added in
  [the transaction routes task](m3-api-09-tx-routes.md).

Internal, unversioned, undocumented: `/api/mesh` (spends the Blockfrost quota),
`/api/stt/sync` (bearer-secret indexer trigger), `/api/koios/credential-utxos`
(browser CORS workaround), and all of `/api/proposals*` (decision 4).

No authentication on the public routes (decision 3).

## Steps

- [x] Add `src/app/api/v1/` routes that re-export the existing handlers. Do not
      copy handler logic.
- [x] Move the app's own fetch calls to `/api/v1` so the app uses its own API.
- [x] Remove the unversioned `lookup` and `pools` paths once nothing internal
      calls them. `mesh`, `sync`, `koios` and `proposals` stay unversioned.

## Done when

- The app itself only calls `/api/v1`.
- The unversioned `lookup` and `pools` paths are gone.
- Grepping `src/` for `"/api/stt/lookup"` and `"/api/pools"` finds only the v1 form.
