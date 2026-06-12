# API: pin the v1 surface and version the routes

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [shared schemas](m3-api-01-shared-schemas.md)

No route carries a version today; renaming anything later breaks whoever built against it. Decide what is public, then freeze it behind `/api/v1/`.

## Surface decision (write it into the spec)

- Public: `/api/v1/stt/lookup` (wallet discovery + state + activity), `/api/v1/pools`.
- Documented but session-authed: `/api/v1/proposals*` — useful to integrating wallet teams.
- Internal, undocumented: `/api/mesh` (spends our Blockfrost quota), `/api/stt/sync` (bearer-secret indexer trigger).

## Steps

- [ ] Add `src/app/api/v1/` routes that re-export the existing handlers — no logic copies.
- [ ] Move the app's own fetch calls to `/api/v1` so we eat our own API.
- [ ] Remove the unversioned public paths once nothing internal calls them; `mesh` and `sync` stay unversioned and internal.

## Done when

- The app itself only calls `/api/v1`.
- Unversioned `lookup`/`pools`/`proposals` paths are gone.
- Grep for `"/api/stt/lookup"` etc. in `src/` finds only the v1 form.
