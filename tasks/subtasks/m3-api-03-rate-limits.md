# API: rate-limit the public routes

Public API task · [Milestone 3](../milestone-3-ui-development.md) · decisions in [the decision record](m3-api-00-decisions.md)

Most of this task is already done, which the original version of this file did
not reflect.

VERIFIED on 2026-08-31:
[`rate-limit.ts`](../../code/dApp/src/lib/http/rate-limit.ts) re-exports
`consumePostgresRateLimit as rateLimit`, so the limiter is already backed by
Postgres and already survives a multi-instance deployment. `stt/lookup` uses 60
per minute, `pools` 30 per minute, and `mesh` 120 per minute with a tighter 20
for expensive methods. All three answer `429` with a `Retry-After` header.

What is left is the transaction-build tier and the documentation.

## The quota risk, accepted

The build routes fetch the caller's UTxOs from Blockfrost (decision 6), and they
are anonymous (decision 3). One HTTP request therefore costs at least one
Blockfrost request against our project key. Sandro accepted this knowingly and
chose to handle it if it becomes a problem. This task's job is to make the cap
tight enough that the problem is slow to arrive, not to re-open the decision.

## Steps

- [ ] Give `/api/v1/tx/*` its own limiter key and a much tighter cap than the
      read routes. Pick the number from the Blockfrost plan's actual limit, not
      from a guess, and write the arithmetic into the task's pull request.
- [ ] Make the caps tunable by environment variable, so a quota problem is a
      configuration change and not a deploy.
- [ ] Confirm `429` responses carry `Retry-After` on the new routes too.
- [ ] Document every limit in the OpenAPI document, per
      [the spec task](m3-api-04-openapi.md).

## Done when

- A flood test against a build route gets `429` and a mock chain client shows the
  provider calls stop at the cap.
- Caps read from the environment, with the current values as defaults.
- The limits appear in the served spec.
