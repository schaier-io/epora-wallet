# Vercel transaction build caches

Owner: coordinator. Status: In Progress. Updated: 2026-10-04.

## Approved scope

REPORTED: The user requested protocol read sharing, regional immutable-output caching,
worker warmup on wallet selection, and merge-conflict repair for the current stack.

VERIFIED: The stack rebased onto `main` at `7ad0e18`. Its conflict was in `status.md`.
Both status records were retained. Source files rebased without conflicts.
VERIFIED: Three branches were created before source edits:
`perf/unified-build-parameters`, `perf/regional-input-metadata`, and
`perf/prewarm-local-evaluation`.

## Shared interfaces and ownership

1. Protocol snapshot. Owner: protocol implementer. Status: Completed.
   VERIFIED: An optional `fetchBuildParameters()` capability provides one
   raw response per build. The browser obtains it through the existing cached RPC.
   A stable server adapter obtains it through `readBuildParameters`.
   Typed parameters, models, and build raw reads derive from that response.
   Explicit epoch reads and ordinary raw reads keep their current paths.
   Verification: count provider/RPC reads, reject invalid models, test retry and clone isolation.

2. Immutable output metadata. Owner: cache implementer. Status: Planned.
   INFERRED design: Only trusted provider reads may populate a regional cache.
   Keys include schema version, project, environment, network, and provider fingerprint.
   The output reference also enters the key. Raw credentials never enter stored data.
   Validate hits and writes. Empty, malformed, or oversized results bypass caching.
   Cache failures fall back to the provider. Spend status and address funds stay live.
   Verification: scope isolation, expiry, failure fallback, payload limits, and fresh status checks.

3. Worker warmup. Owner: worker implementer. Status: Planned.
   INFERRED design: A quiet warm message imports Scalus after a connected wallet is selected.
   It builds no transaction and sends no provider request.
   It shares the evaluation queue and idle cleanup.
   Cancellation of a queued warmup must preserve an active evaluation.
   Verification: selection lifetime, worker reuse, quiet failures, and cancellation.

## Protocol validation

VERIFIED: The seven-suite browser, provider, and actual-script run returned `Tests 72 passed (72)`.
The selected parameter and build-wrapper Node run returned `tests 20; pass 20; fail 0`.
These tests use mock provider responses and synthetic transaction inputs.
They do not measure deployed latency or live remote budget parity.
REPORTED: Baseline source with the new protocol tests returned `4 failed | 3 passed (7)`.
Restored source returned `7 passed (7)`. The independent production review found no defects.

## Least confident decisions

1. INFERRED: Regional cache access will cost less than repeated Blockfrost reads.
   Deployment latency remains unmeasured. Bound cache waits and retain direct fallback.
2. INFERRED: Wallet selection leaves enough time to hide worker startup.
   Browser measurements must verify this overlap.
