# Observability: error sink

Observability task · [Milestone 4](../milestone-4-testnet-feedback.md)

Source evidence as of 2026-09-26, `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
The source references below establish implementation. Live checks and drills retain their own evidence requirements.

Correction: the earlier statement that no error reporting existed was stale.
Sentry integration is present. Its presence does not prove delivery of live events.

## Completed

- [x] Select and document Sentry. `code/dApp/package.json` includes `@sentry/nextjs`. `docs/RUNBOOK.md:235-265` describes browser, server, and API capture.
- [x] Wire server request errors and caught workspace transaction failures. `code/dApp/src/instrumentation.ts:28` exports `Sentry.captureRequestError`. The workspace files call `captureClientError` at `workspace-flow-handlers.ts:205` and `workspace-transaction-submit.ts:299`.
- [x] Add event and breadcrumb scrubbing. `code/dApp/src/lib/observability/sentry-options.ts:73-74` installs the scrubbers. `sentry-scrub.ts:163-184` removes cookies, sensitive headers, and request data.
- [x] Configure release attribution. `code/dApp/src/lib/observability/sentry-options.ts:64-70` selects the supplied release or commit SHA.

## Remaining work and verification

- [ ] Verify caught render errors reach Sentry. `code/dApp/src/components/error-boundary.tsx:94-100` only logs in development and does not explicitly forward the error.
- [ ] Trigger a render crash and a submit failure in an isolated deployed environment. Record both events within one minute and their commit identifiers.
- [ ] Inspect stored events for wallet names and proposal titles. General scrubbing does not establish this acceptance criterion.
