# Observability: error sink

Onboarding & observability task · [Milestone 4](../milestone-4-testnet-feedback.md)

There is no error reporting at all — the [error boundary](../../code/dApp/src/components/error-boundary.tsx) and submit failures log to the console and stop there. On a public testnet that means bugs only exist if a tester writes them up.

## Steps

- [ ] Pick the sink: Sentry via `@sentry/nextjs` is the least work; a small `/api/log` route into Postgres if we'd rather not add a vendor. Record the choice here.
- [ ] Wire in: the error boundary, `signAndSubmitTx` failures in [submit.ts](../../code/dApp/src/lib/mesh/transactions/submit.ts), and API-route 500s.
- [ ] Scrub events: tx hashes and addresses are public chain data anyway, but no wallet names or proposal titles in reports.
- [ ] Tag events with the deployed commit so reports map to code versions.

## Done when

- A forced render crash and a forced submit failure both appear in the sink within a minute, tagged with the commit.
- Spot-check confirms no wallet names or proposal titles in stored events.
