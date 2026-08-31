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

- [ ] One test per documented endpoint. Call the route handler against a seeded
      database, using the existing
      [stt-cache test helpers](../../code/dApp/src/lib/stt-cache/test-helpers.ts),
      which already build fixtures and a mock chain client.
- [ ] Parse each response with its own zod schema from `src/lib/api/`. A parse
      failure is a test failure. No second validator is needed, because the
      schema is the contract.
- [ ] Cover the unhappy paths the spec documents: validation errors, `413`,
      `429`, and the `lookup` rule that exactly one of `paymentKeyHash` or
      `address` is given.
- [ ] Cover the transaction routes with a mock chain client, asserting the
      response parses as `BuildResult` and that a bad action is rejected.
- [ ] Wire the tests into `pnpm test` so frontend CI runs them.

## Done when

- Changing a response shape without changing its schema fails CI.
- Error responses are asserted, not only the happy path.
- Every documented endpoint has at least one test.
