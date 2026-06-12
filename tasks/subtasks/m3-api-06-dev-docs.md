# API: developer docs

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [the spec](m3-api-04-openapi.md)

The spec is the contract; the README is the on-ramp.

## Steps

- [ ] `docs/api/README.md`: a curl example per endpoint with realistic parameters, a pagination walkthrough (cursor in, cursor out), the error shape, and the session-auth walkthrough for proposals.
- [ ] State the versioning policy: v1 is frozen once announced; breaking changes mean `/api/v2`.
- [ ] Link it from the repo README and from the spec's `info.description`.

## Done when

- Someone outside the project finds a wallet and reads its state and activity using only the README + spec — have one person actually try, don't assume.
