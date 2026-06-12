# API: spec round-trip tests in CI

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [the spec](m3-api-04-openapi.md)

A spec nobody checks against reality is wrong within a month. The stt-cache tests already run against a seeded Postgres in CI — reuse that setup.

## Steps

- [ ] One `node:test` per public endpoint: call the route handler with a seeded DB (the [test helpers](../../code/dApp/src/lib/stt-cache/test-helpers.ts) already build fixtures and a mock chain client), validate the JSON response against the OpenAPI schema with ajv.
- [ ] Cover the unhappy paths the spec documents: validation errors, 429, the lookup XOR rule (paymentKeyHash vs address).
- [ ] Wire into `pnpm test` so frontend CI runs them.

## Done when

- Changing a response shape without touching the spec fails CI.
- Error responses validate, not just the happy path.
