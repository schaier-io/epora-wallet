# Vercel transaction build caches

Owner: coordinator. Status: Source complete. Updated: 2026-10-04.

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

2. Immutable output metadata. Owner: cache implementer. Status: Completed.
   VERIFIED: Only trusted provider reads may populate a regional cache.
   Keys include schema version, project, environment, network, and provider fingerprint.
   The output reference also enters the key. Raw credentials never enter stored data.
   Validate hits and writes. Empty, malformed, or oversized results bypass caching.
   Cache failures fall back to the provider. Spend status and address funds stay live.
   Verification: scope isolation, expiry, failure fallback, payload limits, and fresh status checks.

3. Worker warmup. Owner: worker implementer. Status: Completed.
   VERIFIED: A quiet warm message imports Scalus after a connected wallet is selected.
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

## Regional cache validation

VERIFIED: The focused regional, protocol, and browser transport run returned `Tests 45 passed (45)`.
The normalization, environment, and memory-cache Node run returned `tests 28; pass 28; fail 0`.
Scoped ESLint returned exit 0. These tests use an in-memory replacement for the Vercel cache.
They verify the 60-second TTL argument, not deployed expiry or regional latency.

VERIFIED: With only the two server integrations restored to direct reads, the new suite returned
`1 failed | 20 passed (21)`. Its shared-read assertion observed two provider calls instead of one.
Restoring the integrations returned `21 passed (21)`.

VERIFIED: The cache uses `@vercel/functions` version `3.9.11`.
REPORTED: The cache implementer installed the package through Socket Firewall.
VERIFIED: Optional Vercel system variables control cache use.
Cache reads have a 100-millisecond deadline. Writes use `waitUntil` and do not delay the response.
Payloads above 256 KiB bypass the cache. The normalizer removes fields outside immutable output metadata.

VERIFIED: The installed SDK default key hash returns only 32 bits
(`@vercel/functions/cache/index.js:37`). The adapter now supplies SHA-256 for the full scoped key.
The final focused run returned `Tests 46 passed (46)`.
REPORTED: Retaining the new hash test without the fix returned `1 failed | 21 passed (22)`.
The restored regional suite returned `22 passed (22)`.

REPORTED: The final independent adversarial cache review found no remaining defects.
Its actual-SDK probe returned `2 distinct SHA256 backend keys; 2 second-provider cache hits; 2 trusted source reads`.
The probe replaced the request-context backend. It did not access deployed Vercel storage.

## Correction to the earlier full-suite report

VERIFIED: The earlier 24 integration failures came from mock transports sharing the metadata cache.
The earlier baseline already contained that cache, so baseline reproduction did not prove the failures were unrelated.
The owning cache layer now requires an explicit transport scope for sharing across provider instances.
Without that scope, the provider identity owns the cache.
The two affected suites returned `Tests 51 passed (51)` after the repair.
The new scope test failed with the original source and passed with the repair.

## Worker warmup validation

VERIFIED: The complete component run returned `Tests 2164 passed (2164)` across 214 files.
Type checking and full ESLint returned exit 0.
REPORTED: The final independent adversarial worker review found no defects and returned `Tests 48 passed (48)`.
The known-foreign-wallet regression verifies that rejected selections start no warmup.
REPORTED: Disabling the warmup sources retained 34 collected tests and returned `7 failed | 27 passed (34)`.

REPORTED: The actual Worker handler loaded Scalus and returned `{"ok":true,"ready":true}`.
The next synthetic STT evaluation returned `MINT:0`, `mem:470102`, `steps:147666434`.
This probe ran in Node. It did not measure browser startup or deployed latency.
The browser probe did not execute. Brave blocked the page, and the dependency overlay prevented Turbopack package resolution.
The probe changed no browser protections. Temporary routes, fixtures, and configuration changes were removed.

VERIFIED: A full Node attempt returned `tests 1942; pass 1915; fail 1; skipped 26`.
Its source scan captured the temporary probe's `<main>` before cleanup.
The clean full Node run and production build remain pending.
The complete i18n gate also flagged the existing Worker diagnostic response.
That internal response triggers remote fallback. Its formatting repair belongs to the evaluation layer.

## Final stack verification, 2026-10-04

VERIFIED correction: The stack now rests on `main` at `6a0e99b6`.
The later rebase retained both status records and all upstream minimum-ADA tests.
The custom minimum-ADA fixture now supplies the same values through typed and raw protocol reads.

VERIFIED correction: The first Worker formatting change passed the narrow error audit.
The complete i18n gate still rejected its string variable.
The Worker now normalizes failures as `Error` values before creating the unchanged response payload.
The complete i18n gate returned exit 0, and focused tests returned `Tests 30 passed (30)`.
REPORTED: The final diagnostic review verified six error cases preserve the exact response payload.

VERIFIED: Socket Firewall completed a frozen lockfile install with exit 0.
Final validation uses Node `24.21.0` and the locked Next `16.3.8`.
The component run returned `Tests 2169 passed (2169)` across 215 files.
Type checking, full ESLint, and the complete i18n gate returned exit 0.
OpenAPI returned `OpenAPI document is in sync`.
Generated fixtures returned `generated fixtures match committed CBOR`.
Helper checks returned `user-flow helper smoke checks passed`.
Source length returned `File length OK: 791 source files checked, none over 750 lines.`

VERIFIED: The local Turbopack build could not bind its worker port:
`binding to a port; Operation not permitted (os error 1)`.
The Webpack production build returned exit 0 and `Compiled successfully in 29.8s`.
Webpack does not emit this project's expected route statistics.
The bundle gate reported `no build stats found`, so local bundle budgets remain unverified.
CI keeps the existing Turbopack build and bundle gate.

VERIFIED correction: The first locked Node run returned `pass 1927; fail 2; skipped 26`.
Both configuration failures came from `ERR_SWC_NATIVE_CACHE` under the restricted user cache.
With `SWC_NATIVE_BINDING_CACHE` set to a temporary writable directory,
the two configuration test files returned `tests 10; pass 10; fail 0`.
VERIFIED: The full rerun returned `tests 1955; pass 1929; fail 0; skipped 26`.
Database cases require Postgres and remain outside local validation.

REPORTED: The final cross-layer adversarial review found no functional defects.
The review checked protocol snapshots, transport scope, regional keys, remote fallback, and warmup guards.

## Least confident decisions

1. INFERRED: Regional cache access will cost less than repeated Blockfrost reads.
   Deployment latency remains unmeasured. Bound cache waits and retain direct fallback.
2. INFERRED: Wallet selection leaves enough time to hide worker startup.
   Browser measurements must verify this overlap.
