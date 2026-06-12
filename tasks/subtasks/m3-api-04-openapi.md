# API: OpenAPI spec, served by the app

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [v1 routes](m3-api-02-v1-routes.md)

Catalyst M3 explicitly asks for "an API + spec for external developers". There is no spec file anywhere in the repo today.

## Steps

- [ ] Write `docs/api/openapi.yaml` (OpenAPI 3.1) covering every v1 route: parameters, response schemas, pagination cursors, the error shape, and the rate limits.
- [ ] Include the proposals auth flow as documented endpoints: nonce → CIP-30 `signData` → session cookie.
- [ ] Serve the document at `/api/v1/openapi.json`.
- [ ] Lint it (`@redocly/cli lint` or spectral) and add the lint to frontend CI.

## Done when

- The spec lints clean in CI.
- `/api/v1/openapi.json` returns it.
- Every v1 route, including the auth handshake, is in the document.
