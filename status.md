# Mainnet beta and closeout status

Updated: 26 September 2026.

## Mainnet beta

The mainnet beta is online. GET `/api/health` returned HTTP 200 with `status: ok` at `2026-09-26T01:30:26.157Z`.
The [mainnet evidence](docs/closeout/mainnet-evidence.md) records eight confirmed transactions and two wallets holding 27 ADA, plus separate state deposits.
The earlier deployment-pending entry described preparation before launch. It is superseded by the deployment and transaction evidence.
Recovery drills and wider economics checks remain open in the [Milestone 5 checklist](tasks/milestone-5-mainnet-closeout.md).

## Closeout documents

The [report](docs/closeout/closeout-report.pdf) covers Deliverables, Usage, Impact, and Sustainability.
The [submission text](docs/closeout/milestone-5-submission.txt) maps outputs A-E to the approved acceptance criteria and evidence.
The [submission checklist](docs/closeout/submission-review.md) explains the evidence scope and publication steps.
The report records that no revenue is currently generated and that operating costs are covered by received Catalyst funds.
Publication on `main` and Catalyst acceptance are separate steps.

## Network and beta acknowledgement

- `CARDANO_NETWORK` and `cardanoNetworkId()` provide the shared network interface. `NEXT_PUBLIC_CARDANO_NETWORK` selects the build network; Preprod remains the default.
- The dApp's `src/lib/legal.ts` defines legal identity, paths, and the acknowledgement version.
- Consent is scoped to the network and legal version. It does not prove that a person read the notice or signed a wallet agreement.
- Legal documents remain readable before wallet providers start.

## Release preparation records

The [release record](docs/mainnet-beta-release.md) preserves validation results and deployment details.
The initial gate/footer check returned `Tests 14 passed (14)`. Network, address, and slot checks on Node v24.14.0 returned `tests 15`, `pass 15`, `fail 0`.
An Aiken run returned `total: 750, passed: 750, failed: 0`, with seed `3106021271` (713 unit tests and 37 property tests).
Other recorded runs contain 70 unit tests, 169 component tests, and 19 API tests. Counts across runs can overlap.
These test results do not constitute an external audit.

The network layer is recorded as `2a2cd8ed`. This replaced the earlier `3c51eb7f` reference after the stack was rebased onto `dev` at `5d936c45` on 23 September 2026.
The release record contains post-rebase validation for the consent layer.

## Remaining operational limits

Production processor contracts, hosting regions, and retention settings require operational checks beyond source inspection.
The company details and `info@41bit.io` are operator-supplied. An automated Wyoming registry lookup encountered a human-verification page and did not establish company status.
Wallet-signed terms acceptance is deferred. The beta uses a browser/API acknowledgement.

## Wallet update sidebar, 2026-10-04

- Completed, implementer. VERIFIED: `wallet-state-update-banner.tsx` shows the pending transaction only for a selected blocked action. `workspace-sidebar-view.tsx` mounts it before wallet detection completes. The retry control is removed.
- VERIFIED: banner regressions returned `Tests 6 failed | 2 passed (8)` before the initial fix. The empty-cache sidebar regression returned `Tests 1 failed | 9 passed (10)` before the placement fix.
- VERIFIED: the two component suites returned `Tests 18 passed (18)` on the branch based on `dev`. Typecheck, changed-file ESLint, and `git diff --check` exited with code 0. These checks used local dependencies and mocked wallet data. Browser layout was not measured.
- Next, reviewer: review the PR against `dev`.

## Error repair, 2026-10-03

- VERIFIED, coordinator: repair layers are `fix/mesh-read-recovery`, `fix/build-error-recovery`, and `fix/signer-schema-readiness`.
- Completed, implementer: provider reads and Koios retry handling. Evidence: `Tests 62 passed (62)`.
- Completed, coordinator: spent-input recovery and depleted-funds guidance. Evidence: `tests 76`, `pass 76`, `fail 0`.
- Completed, coordinator: signer endpoint readiness and deployment migration command. Evidence: `Tests 4 passed (4)` and `tests 2`, `pass 2`, `fail 0`.
- REPORTED: the pasted event says `public.SignerRegistration` does not exist. The current production schema is not determined.
- VERIFIED: provider and Koios tests returned `Tests 62 passed (62)`. Mocked requests do not establish live provider availability.
- VERIFIED: submission, freshness, and recovery-view checks returned `Tests 60 passed (60)`. These are local tests.
- VERIFIED: final combined runs returned `Tests 126 passed (126)` and `tests 78`, `pass 78`, `fail 0`. Tests used existing local dependencies.
- REPORTED: independent reviews of each layer returned a clean result. VERIFIED: no live migration or deployment ran.
- Next: obtain Sentry event URLs and verify the affected deployment. Production migration and publication require user approval.

## Review correction, 2026-10-03

- VERIFIED correction: the earlier `build:deploy` command ran migrations in every environment. That allowed a preview build to migrate its configured database.
- REPORTED: [review finding on PR 673](https://github.com/schaier-io/epora-wallet/pull/673#discussion_r4173319746) identified the risk when Preview shares a production database.
- VERIFIED: `build:deploy` now runs migrations only when `VERCEL_ENV` is `production`. Deployment tests returned `tests 5`, `pass 5`, `fail 0`, after `fail 3` before the guard.
- REPORTED: the independent review returned a clean result. VERIFIED: tests used stub commands. No live database settings changed.

## Bug fixes, 2026-10-04

- VERIFIED, coordinator: three branches were created before source edits: `fix/wallet-recovery-session`, `fix/proposal-json-errors`, and `fix/allowance-zero-reset`.
- Completed, implementer, FIX-1: wallet recovery ownership. VERIFIED: `vitest run src/providers/wallet-provider.test.tsx` returned `Tests 39 passed (39)` on current main plus the fix. Three regression cases failed before the fix. Tests use mocked wallets. REPORTED: final independent review found no issues.
- Completed, implementer, FIX-2: proposal JSON errors. VERIFIED: `vitest run src/app/api/proposals` returned `Tests 71 passed (71)`. With original route source and the new tests, `Tests 12 failed | 2 passed (14)`. Route tests mock authentication and providers. REPORTED: independent adversarial review found no issues.
- Completed, implementer, FIX-3: allowance reset display. VERIFIED: model/access tests returned `tests 14`, `pass 14`, `fail 0`. Console tests returned `Tests 6 passed (6)`. The model regression with original source returned `tests 11`, `pass 10`, `fail 1`. These checks use local data. REPORTED: independent adversarial review found no issues.
- VERIFIED correction: FIX-2 includes `PATCH /api/proposals/[id]/rebuild`. The earlier POST-only scope was too narrow.
- VERIFIED, coordinator: the final combined component run returned `Test Files 9 passed (9)` and `Tests 116 passed (116)`. The separate model/access run returned `tests 14`, `pass 14`, `fail 0`. Counts cover these selected tests, not the full repository suite.
- VERIFIED: `tsc --noEmit` exited 0. The file limit check returned `File length OK: 781 source files checked, none over 750 lines.`
- VERIFIED: tests used existing dependencies linked from the main checkout. Prisma client generation used a placeholder localhost URL. No database migration ran.
- Next: review the three fixes and CI before merging.

## dApp bug review, 2026-10-04

- Completed, coordinator. VERIFIED: reviewed API and proposal paths, transaction builders, workspace state, and providers at `06c3a69a`. This was a source review with local reproductions, not an exhaustive audit.
- VERIFIED: `wallet-provider.tsx:500-524` can cancel a manual connection that started before the focus check. The reproduction returned `Tests 2 failed | 36 skipped (38)` with `expected false to be true` for both authorization outcomes.
- VERIFIED: `proposals/store.ts:111-127` can overwrite a new signature with a delayed signature for the previous body. The local reproduction returned `{"oldResult":{"ok":true},"newResult":{"ok":true},"currentBody":"new-body","storedWitnessBody":"old-body","currentSignatureLost":true}`. Database transport and witness validation were mocked.
- VERIFIED: `proposals/verify.ts:138-143` omits reference inputs from its liveness check. The local reproduction returned `"validity":"valid"` and `"reasons":[]` for a transaction with a spent reference input. Chain reads were mocked.
- VERIFIED: `transactions/lock-funds.ts:46-49` built a deposit below the local minimum-output calculation. The real Mesh build returned `{"built":true,"outputLovelace":"1","minimumLovelace":"853380"}`. The minimum includes sizing headroom; no ledger submission ran.
- VERIFIED: `workspace-wallet-seeding.atoms.ts:107-118` preserves governance payloads when changing wallets. The reproduction returned `"walletAssetName":"02"`, but retained wallet 01's certificate address and DRep ID. INFERRED: credential and script mismatch can prevent the next governance transaction. Ledger acceptance was not tested.
- VERIFIED: unit command `env -u DATABASE_URL node --import tsx --test --test-concurrency=1 'src/**/*.test.ts'` returned `tests 1904`, `pass 1878`, `fail 0`, `skipped 26`. Skipped tests do not establish database behavior.
- VERIFIED: component command `node node_modules/vitest/vitest.mjs run --maxWorkers=2` returned `Test Files 204 passed (204)` and `Tests 2050 passed (2050)`. These existing tests did not catch the reproduced bugs.
- VERIFIED: `tsc --noEmit --incremental false` exited with code 0 after local Prisma client generation. The earlier typecheck lacked that generated client. Tests used existing local dependencies and Node v24.21.0.
- Next, coordinator: fix the five reported paths and add regression tests. Source files, databases, and deployments were not changed.

## dApp bug fixes, 2026-10-04

- Completed, implementer: five fixes have separate PR layers. VERIFIED: the local stack starts at `fix/wallet-focus-connect-race` and ends at `fix/governance-draft-wallet-switch`.
- VERIFIED: wallet regressions returned `Tests 2 failed | 38 skipped (40)` before the source change. The wallet and toast suites then returned `Tests 48 passed (48)`.
- REPORTED: an independent adversarial review of the wallet change found no in-scope issues. VERIFIED: recovery reads the live connection atom before starting another connection.
- VERIFIED: signature regressions returned `2 failed | 1 passed (3)` with the source reverted. The concurrency and route suites then returned `Tests 7 passed (7)`. Database transport and row locks were modeled locally.
- VERIFIED: reference and collateral regressions returned `tests 8`, `pass 0`, `fail 8` with the source reverted. The verification, binding, and State transition suites then returned `tests 58`, `pass 58`, `fail 0`.
- VERIFIED: deposit regressions returned `tests 9`, `pass 6`, `fail 3` before the fix. Minimum-value and zero-row suites then returned `tests 38`, `pass 38`, `fail 0`.
- VERIFIED: governance seeding regressions returned `tests 4`, `pass 2`, `fail 2` before the fix. Seeding and session-selection suites then returned `tests 10`, `pass 10`, `fail 0`.
- REPORTED: independent adversarial reviews of each fix and the complete patch found no in-scope issues. Source and tests were reviewed; this was not an external audit.
- VERIFIED: the full unit command returned `tests 1917`, `pass 1891`, `fail 0`, `skipped 26`. The full component command returned `Test Files 205 passed (205)` and `Tests 2055 passed (2055)`. Commands match the review record above, with component workers limited to two.
- VERIFIED: typecheck and changed-file ESLint exited with code 0. The length check returned `File length OK: 781 source files checked, none over 750 lines.`
- VERIFIED correction: the preceding full-suite counts describe the stack before rebasing. Main advanced to `7ad0e182` during this run. The rebase preserved its wallet recovery checks and added the pending-connection guard. Both status records were retained.
- VERIFIED: the wallet regressions still failed against updated main: `Tests 2 failed | 41 skipped (43)`. With the fix restored, the rebased full unit suite returned `tests 1918`, `pass 1892`, `fail 0`, `skipped 26`. Components returned `Test Files 206 passed (206)` and `Tests 2072 passed (2072)`. Typecheck exited 0.
- REPORTED: a second full adversarial review after rebase found no in-scope issues.
- Completed, release. VERIFIED: `gh stack submit --auto` returned `Pushed and synced 5 branches`. Draft PRs are [wallet recovery #693](https://github.com/schaier-io/epora-wallet/pull/693), [signature writes #694](https://github.com/schaier-io/epora-wallet/pull/694), [input liveness #695](https://github.com/schaier-io/epora-wallet/pull/695), [deposits #696](https://github.com/schaier-io/epora-wallet/pull/696), and [governance drafts #697](https://github.com/schaier-io/epora-wallet/pull/697).
- Next: review the stack from #693 upward. No merge, deployment, or migration ran. Local fixtures do not establish live ledger or PostgreSQL behavior.
## Transaction preparation, 2026-10-03

Owner: implementer. Status: Completed.
VERIFIED: Changed the review rail, transaction cache reuse, and their tests.
VERIFIED: `vitest run` on the six preparation and submission suites returned `Tests 156 passed (156)`.
VERIFIED: The final regression tests against the original source returned `Tests 4 failed | 44 passed (48)`, exit 1.
VERIFIED: `tsc --noEmit --incremental false` and ESLint on the four changed TypeScript files returned exit 0.
VERIFIED: `node scripts/check-file-length.mjs` returned `File length OK: 771 source files checked, none over 750 lines.`
REPORTED: The independent adversarial review found no introduced defects. Its four-suite run returned `Tests 119 passed (119)`.
Limit: Mocked wallet and provider tests do not measure deployed behavior or network latency.
Next: Check the button flow with a connected wallet in the browser.

## Build speed, 2026-10-03

Owner: implementer. Status: Completed.
VERIFIED: Updated `utxo.ts`, `state-forwarding.ts`, `build-parameter-fetcher.ts`, `budget.ts`, and four tests in `code/dApp/src/lib/mesh/transactions/internals/`.
VERIFIED: Input metadata and unspent-status reads now run together. Raw latest parameters are prefetched before script builds and cached within one build.
VERIFIED: The full internals and cancellation run returned `# tests 251`, `# pass 251`, `# fail 0`.
VERIFIED: The six workspace and submission suites returned `Tests 156 passed (156)`.
VERIFIED: Final tests against the original four source files returned `# tests 61`, `# pass 55`, `# fail 6`, exit 1.
VERIFIED: Type checking and changed-file lint returned exit 0. The file-length check returned `File length OK: 771 source files checked, none over 750 lines.`
REPORTED: The independent adversarial review found no introduced defects. Its focused run returned `tests 61`, `pass 61`, `fail 0`.
Limit: Tests use mocked providers. Stage timings measure successful builds only. Overlapping work means stage durations are not additive.
Next: Run one transaction build and inspect `[tx-build:timings]` in the browser console. Real network speed remains unmeasured.

## Additional build caches, 2026-10-03

Owner: implementer. Status: Completed.
VERIFIED: Latest protocol parameters, cost models, and build raw parameters share a provider response for 5 seconds. Signing raw reads bypass this cache. Explicit epoch requests retain the SDK path (`blockfrost-server.ts`).
VERIFIED: `blueprint.ts` caches script code, hashes, and addresses in separate 128-entry maps. Keys include script code, version, parameters where applicable, and address network.
VERIFIED: `build-parameter-fetcher.ts` shares input metadata across draft and final passes. It shares unspent status within each pass and resets status before the final pass (`budget.ts`). Configured reference reads run together (`reference-scripts.ts`).
VERIFIED: The Node suite covering parameters, Blockfrost, build internals, cancellation, and script addresses returned `# tests 276`, `# pass 276`, `# fail 0`.
VERIFIED: Six Vitest suites covering script caches, RPC calls, submission, and workspace behavior returned `Tests 135 passed (135)`.
VERIFIED: Disabling parameter, input metadata, and status caches while retaining tests returned `# tests 19`, `# pass 14`, `# fail 5`, exit 1. Restored sources returned `# tests 19`, `# pass 19`, `# fail 0`.
VERIFIED: Original `HEAD` script source with final cache tests returned `Tests 4 failed | 2 passed (6)`, exit 1. Restored source returned `Tests 6 passed (6)`.
VERIFIED: Type checking and changed-file ESLint returned exit 0. File-length validation returned `File length OK: 771 source files checked, none over 750 lines.`
VERIFIED: A local Node benchmark used 30 warm samples per operation. Median STT policy derivation changed from `22.797167 ms` to `0.009792 ms`. Median wallet hash derivation changed from `15.723458 ms` to `0.014916 ms`.
REPORTED: The second independent adversarial review found no remaining introduced defects. The first pass found a historical-epoch regression. Explicit epoch SDK delegation and its regression test corrected it.
Limit: Provider tests use mocks. The benchmark measures repeated CPU work, not full build time or network latency. Cold derivations still compute their first result.
Next: Run one browser transaction build and inspect `[tx-build:timings]`.

## PR preparation, 2026-10-03

VERIFIED: Applied the performance changes onto `origin/main` at `e198fb71`. Preserved upstream transport retries, submission phases, and existing status records.
VERIFIED correction: The first conflict resolution left two undefined `activeBuild` references in the review rail. The component run returned `Tests 31 failed | 145 passed (176)`. Removed both background-progress expressions and restored quiet-build expectations.
VERIFIED correction: Pending protocol requests previously had infinite cache expiry. A deferred-provider regression test returned `tests 8`, `pass 7`, `fail 1`. Pending entries now expire after `MESH_READ_TIMEOUT_MS`. The same test file returned `tests 8`, `pass 8`, `fail 0`.
VERIFIED: Final Node validation returned `tests 277`, `pass 277`, `fail 0`. Final component validation returned `Tests 176 passed (176)`.
VERIFIED: Type checking and changed-file ESLint returned exit 0. File-length validation returned `File length OK: 781 source files checked, none over 750 lines.`
REPORTED: Fresh independent reviews of build reads and button behavior found no remaining introduced defects.
Limit: These tests do not measure deployed build latency. The benchmark above remains a local CPU measurement.

## Additional wallet build reads

VERIFIED: `core.ts` starts change and authority reads while wallet inputs load. `utxo.ts` resolves fallback addresses together and queries providers in batches of eight. Authority priority and failure behavior remain unchanged.
VERIFIED: `immutable-input-cache.ts` retains up to 128 immutable output snapshots for 60 seconds. Keys include network, provider, transaction, and output index. Pending entries expire after 15 seconds. Canceled callers do not share pending requests.
VERIFIED: The spent-between-builds test reuses metadata once and reads status twice. The second status check rejects with `already spent by new-spender`.
VERIFIED: Original source with final tests returned `tests 58`, `pass 49`, `fail 9`, exit 1. Restored source passed the full Node run: `tests 293`, `pass 293`, `fail 0`.
VERIFIED: Combined component and evaluation checks returned `Tests 180 passed (180)`. Type checking and changed-file lint returned exit 0. File-length validation returned `File length OK: 782 source files checked, none over 750 lines.`
REPORTED: Independent reviews of wallet reads and metadata caching found no remaining introduced defects.
Limit: Mocked wallet and provider tests prove concurrency and isolation. They do not establish deployed latency. Local evaluation remains a separate experiment.

## Metadata transport scope correction, 2026-10-04

Owner: coordinator. Status: Completed.
VERIFIED correction: Class identity made test transports share metadata even when their output sources differed.
`ServerFetcher` now advertises an explicit shared scope. Other providers retain their own identity unless they opt in.
VERIFIED: The two affected integration suites returned `Tests 51 passed (51)`.
The metadata suite returned `tests 10; pass 10; fail 0`.
Restoring only the original cache source retained the regression and exited 1 with `actual: 1, expected: 0`.
Limit: The tests use mock ledgers. They do not establish deployed cache latency.

## Local evaluation diagnostic formatting (2026-10-04)

VERIFIED: The i18n audit flagged the Worker's internal failure response.
The Worker now formats the diagnostic before it creates the response. The response payload is unchanged.
Production callers discard this diagnostic and use remote evaluation. It is not UI text.
VERIFIED: The i18n audit returned `No internal sentinels, raw user-facing errors, or static visible text bypass i18n.`
Worker and hybrid tests returned `Tests 30 passed (30)`.
REPORTED: The final independent adversarial review found no defects and independently returned `Tests 30 passed (30)`.
## Vercel build caches, 2026-10-04

Owner: coordinator. Status: In Progress.
VERIFIED: The original five-layer stack rebased onto `main` at `7ad0e18`.
Both conflicting status records were retained. `git range-diff` showed identical source patches.
VERIFIED: Three new branches were created before source edits for protocol sharing, regional metadata, and worker warmup.
VERIFIED: Protocol and actual-script checks returned `Tests 72 passed (72)`.
Selected parameter and build-wrapper Node checks returned `tests 20; pass 20; fail 0`.
REPORTED: The independent protocol review found no defects.
VERIFIED correction: The earlier 24 failures also reproduce on the feature's unchanged baseline, which already includes the memory cache.
Disabling only the metadata cache returned `Tests 51 passed (51)` for those two suites.
Their test transports reuse transaction hashes with different output content.
Next: Make cache sharing explicit, then complete regional metadata caching and worker warmup.
Limit: Local tests do not establish deployed cache latency or live evaluator parity.

## Unified protocol fixture correction (2026-10-04)

VERIFIED: The full Node run collected `tests 1942`, with `pass 1910`, `fail 6`, and `skipped 26`.
The six failures came from two test fixtures that lacked the new raw protocol snapshot.
Fixtures now supply the same complete synthetic response used by the evaluation tests.
Unified-read assertions expect one raw read and zero separate protocol/model reads.
The generic-provider test retains optional prefetch retry coverage.
Wallet cancellation tests mock the snapshot capability and perform no real RPC.
VERIFIED: The two corrected suites returned `tests 15; pass 15; fail 0`.
The earlier full Node run was a failed validation run, not a production-network measurement.

Next: Propagate this fixture correction, then add worker warmup.
REPORTED: The final independent adversarial fixture review found no defects. It returned `tests 15; pass 15; fail 0`.
## Regional immutable output cache (2026-10-04)

VERIFIED: Trusted RPC and server build output reads now use the Vercel regional cache.
Only immutable output metadata enters the cache. Spend-status reads remain live.
Keys separate project, environment, network, provider fingerprint, and output reference.
The schema namespace permits compatible entries across deployments.
VERIFIED: Regional/protocol/browser transport tests returned `Tests 45 passed (45)`.
Normalization/environment/memory tests returned `tests 28; pass 28; fail 0`.
Scoped ESLint returned exit 0. Tests replace the Vercel cache and do not measure deployed latency.
VERIFIED: Restoring only the two integrations to direct provider reads returned
`1 failed | 20 passed (21)`. Restored integrations returned `21 passed (21)`.

Next: Review this layer, then add quiet worker warmup.

VERIFIED: The regional cache adapter now overrides the SDK default 32-bit key hash with SHA-256.
The final focused regional/protocol/browser run returned `Tests 46 passed (46)`.
REPORTED: Its new hash regression returned `1 failed | 21 passed (22)` before the fix.
REPORTED: The final independent adversarial cache review found no remaining defects.

## Quiet evaluation warmup (2026-10-04)

VERIFIED: A connected wallet selection starts quiet Worker warmup. Known foreign selections skip it.
Warmup imports Scalus. It builds no transaction and sends no provider request.
The existing queue, cancellation, timeout, and idle cleanup remain active.
VERIFIED: The full component run returned `Tests 2164 passed (2164)`. Type checking and full ESLint returned exit 0.
REPORTED: The final independent adversarial review found no defects. Its four-suite run returned `Tests 48 passed (48)`.
REPORTED: The actual Worker handler returned `ready:true`, then evaluated the synthetic STT mint with
`mem:470102`, `steps:147666434`. This Node probe cannot measure browser startup.
The browser probe did not execute. No browser latency improvement is claimed.
VERIFIED: The full Node attempt returned `tests 1942; pass 1915; fail 1; skipped 26`.
The failure came from scanning a temporary probe before cleanup. The probe has been removed.
The i18n gate flagged the existing local-evaluation diagnostic response. Its owning layer needs a formatting repair.

Next: Repair that diagnostic, verify #684 independently, and complete clean full validation.

## Final cache stack checks, 2026-10-04

Owner: coordinator. Status: Source complete.
VERIFIED: All eight branches rebased onto `main` at `6a0e99b6`.
The complete component run returned `Tests 2169 passed (2169)`.
The Node rerun returned `tests 1955; pass 1929; fail 0; skipped 26`.
Database cases require Postgres. Local validation did not run those cases.
VERIFIED: Type checking, full ESLint, the complete i18n gate, OpenAPI, generated fixtures, and helper checks returned exit 0.
Source length returned `File length OK: 791 source files checked, none over 750 lines.`
VERIFIED: The Webpack production build returned exit 0.
Turbopack could not bind its worker port in this environment. Webpack did not emit route budget statistics.
The existing CI Turbopack build and bundle gate remain unchanged.
REPORTED: The final cross-layer adversarial review found no functional defects.
Limit: Deployed cache latency, browser warmup overlap, and live remote evaluation parity remain unmeasured.


## Transaction build latency, 2026-10-04

VERIFIED: One branch contains the requested performance changes. It rebased onto `2ca8b150` without conflicts.
Reference hashes reuse the existing bounded script cache. Wallet selection preloads immutable reference metadata.
Review entry warms the evaluation worker again. Independent State and reference reads overlap wallet setup.
Exact evaluation candidates share one owned result within a build pass. Each final pass resets this memo.
Fresh spent-status checks remain per pass. Existing form prebuild already prepares and reuses the action payload.
VERIFIED: Matching expensive RPC hints combine caller and method limits in one PostgreSQL statement.
Existing probabilistic cleanup and mismatched hints can add database queries.
RPC and API diagnostics report durations without transaction payloads or keys.
VERIFIED: Full Vitest returned `Tests 2232 passed (2232)`.
The Node suite returned `tests 1966; pass 1935; fail 0; skipped 31`.
Skipped database tests were not validated by that suite. The isolated rate-limit PostgreSQL run returned `tests 9; pass 9; fail 0; skipped 0`.
VERIFIED: Type checking, full ESLint, i18n, OpenAPI, generated fixtures, and helper checks returned exit 0.
The new main sidebar tests returned `Tests 18 passed (18)` after the rebase.
VERIFIED: Webpack production build returned exit 0. Local Turbopack failed with `binding to a port: Operation not permitted (os error 1)`.
Webpack does not emit the route bundle statistics. CI must validate the Turbopack bundle gate.
REPORTED: Independent adversarial reviews found no remaining defects.
REPORTED: Source-reverted route tests collected 29 cases, with 11 failures. Restored source passed all 29.
REPORTED: Source-reverted evaluation tests collected 8 cases, with 8 failures. Restored source passed all 8.
Limit: Live provider and deployed Vercel latency remain unmeasured. No production latency reduction is claimed.


## PR #705 CI schema correction, 2026-10-04

VERIFIED: CI run `37148087493` returned `tests 2008; pass 2007; fail 1; skipped 0`.
The new schema test failed with `relation "public.ApiRateLimit" does not exist`.
The prior local nine-test check used `public`. It did not test CI's `stt_test` source schema.
VERIFIED: A local database with only `stt_test.ApiRateLimit` reproduced `tests 6; pass 5; fail 1`.
The fixture now copies from `getDatabaseSchema()` and quotes that identifier.
The same non-public database then returned `tests 9; pass 9; fail 0; skipped 0`.
VERIFIED: Scoped ESLint and TypeScript checks returned exit 0.
VERIFIED: PR #705 now reports `baseRefName: dev` and `mergeable: MERGEABLE`.
Production code remains unchanged. The lesson is to test database fixtures with the same schema isolation as CI.
## Transaction build performance fixes, 2026-10-04

Owner: coordinator. Status: Local source complete.
VERIFIED: `core.ts` registers known inputs for evaluation and selects metadata for serialized transaction references.
VERIFIED: `state-forwarding.ts` and `stt-spend.ts` overlap independent preparation reads.
VERIFIED: `blockfrost-reads.ts` filters indexed outputs before script hydration and bounds the shared verified-script cache.
VERIFIED: `use-local-evaluation-warmup.ts` retains the worker during visible editing and supports new-wallet mint warmup.
VERIFIED: `build-parameter-fetcher.ts` records fixed-code evaluation diagnostics without transaction contents.
VERIFIED: `/api/mesh` returns `Server-Timing` values for `rate_limit`, `execute`, and `total`.
VERIFIED: Mesh defaults changed from 1200 to 2400 general requests and from 200 to 400 expensive requests per caller.
VERIFIED: Transaction build defaults changed from 5 to 10 per caller and from 25 to 50 per deployment.
VERIFIED: Input-work defaults changed from 40 to 80 per caller and from 120 to 240 per deployment.
All windows remain 60000 milliseconds. Existing environment overrides retain priority.

VERIFIED: The component suite returned `Test Files 217 passed (217); Tests 2207 passed (2207)`.
VERIFIED: Type checking, full ESLint, and the complete i18n gate returned exit 0.
VERIFIED: OpenAPI validation returned `OpenAPI document is in sync`.
VERIFIED: Source length returned `File length OK: 791 source files checked, none over 750 lines.`
VERIFIED: The unchanged PostgreSQL quota tests returned `tests 3; pass 3; fail 0` against an isolated local database.
The application database and its schema were not changed. The isolated server has stopped.
REPORTED: Independent adversarial reviews of all four layers ended with clean full passes.
VERIFIED correction: A paired quota-query experiment moved body parsing before the general gate.
The experiment was removed. The general gate still rejects blocked callers before it reads their bodies.
VERIFIED: The first full Node run returned `tests 1968; pass 1940; fail 2; skipped 26`.
Both failures reported `ERR_SWC_NATIVE_CACHE` because the sandbox blocked the compiler cache lock.
The two affected suites passed with a writable cache: `tests 10; pass 10; fail 0`.
VERIFIED: The production build failed to fetch Google Fonts with `ENOTFOUND fonts.googleapis.com`.
Automatic approval review rejected the network retry because the current message did not approve that external call.
Limit: Production compilation, deployed latency, and browser memory use remain unverified.
Next: Obtain approval for the production build's Google Fonts request. Push and deployment require separate approval.

VERIFIED: The full Node rerun used `SWC_NATIVE_BINDING_CACHE=/private/tmp/epora-tx-swc-cache`.
It returned exit 0 with `tests 1968; pass 1942; fail 0; skipped 26`.
The skipped cases did not run in that database-free suite. The isolated quota run above covers its three database tests.

## PR stack reconciliation, 2026-10-04

VERIFIED: `origin/main` advanced from `2ca8b150` to `f4e9d276`.
The rebase preserves its `resolvedInput` preparation API and exact evaluation cache.
VERIFIED correction: The earlier `execute` timing name described the original branch.
The rebased route keeps main's `rate_limit`, `provider`, and `total` names.
It also keeps main's hinted paired quota check before body parsing.
REPORTED: Independent input review passed 21 Node tests and 49 component tests with no findings.
REPORTED: Worker review found a diagnostic format conflict.
The resolution preserves main's `[tx-build:evaluation]` format.
The second review passed 62 component tests and found no remaining issues.

VERIFIED: Full rebased Vitest returned `Test Files 222 passed (222); Tests 2265 passed (2265)`.
VERIFIED: Full rebased Node tests returned `tests 1979; pass 1948; fail 0; skipped 31`.
This database-free run does not validate the skipped database cases. CI must run those cases with PostgreSQL.
VERIFIED: Type checking, full ESLint, i18n, and OpenAPI validation returned exit 0.
REPORTED: Fresh provider review passed 44 Node tests and 24 component tests with no findings.
REPORTED: Final rate review passed 36 route tests and seven quota-default tests with no findings.


## Transaction regression fixes, 2026-10-04

VERIFIED correction: The previous readiness report missed two build paths.
The new tests fail with the original source: `tests 40; pass 37; fail 3` and `Tests 1 failed | 10 passed (11)`.
The failures cover the RPC input ceiling and enterprise-to-base collateral return sizing.
VERIFIED: The fix uses one size-based evaluation ceiling and the actual collateral return address.
VERIFIED: Focused Node validation returned `tests 64; pass 64; fail 0`.
VERIFIED: Full Vitest returned `Test Files 223 passed (223); Tests 2274 passed (2274)`.
VERIFIED: Full Node returned `tests 1997; pass 1964; fail 2; skipped 31`.
Both failures reported `ERR_SWC_NATIVE_CACHE` because the sandbox blocked the default cache path.
VERIFIED: Those test files passed with `SWC_NATIVE_BINDING_CACHE=/private/tmp/epora-swc-native`: `tests 10; pass 10; fail 0`.
The database-free run does not validate the skipped database cases.
VERIFIED: Type checking, full ESLint, OpenAPI validation, and diff checks returned exit 0.
VERIFIED: `File length OK: 794 source files checked, none over 750 lines.`
REPORTED: Independent adversarial review found no findings in the fix diff.
The RPC regression uses a stub provider; local evaluation tests mock the worker.
These checks do not establish live provider or chain acceptance.


## Remote evaluation overlap recovery, 2026-10-04

REPORTED: Preprod builds failed after merge with `EvaluationFailure.AdditionalUtxoOverlap`.
VERIFIED correction: Earlier RPC tests accepted registered input metadata without simulating the node's overlap rule.
The new regression runs Mesh serialization and error handling with simulated HTTP responses.
VERIFIED: Before the source fix, that run returned `tests 13; pass 12; fail 1` with a doubly encoded Ogmios overlap response.
VERIFIED: Both browser RPC and direct server builds now remove only reported overlaps and retry once.
Unmatched supplemental inputs and chained transactions remain available to the evaluator.
VERIFIED: Focused Node returned `tests 46; pass 46; fail 0`.
VERIFIED: Focused Vitest returned `Test Files 4 passed (4); Tests 20 passed (20)`.
VERIFIED: Full Vitest returned `Test Files 224 passed (224); Tests 2275 passed (2275)`.
VERIFIED: Type checking, full ESLint, OpenAPI validation, and diff checks returned exit 0.
VERIFIED: `File length OK: 795 source files checked, none over 750 lines.`
REPORTED: Independent adversarial review found no issues in the fix.
The HTTP responses and remote budgets were simulated. No live preprod transaction was submitted.

## Direct database URL for Prisma CLI, 2026-10-04

Owner: coordinator. Status: Completed.
Scope: Prisma config, test command, environment documentation, configuration tests, and their CI step.
VERIFIED: Before the fix, configuration tests returned `tests 6; pass 3; fail 3`.
VERIFIED: The updated config prefers `DATABASE_URL_UNPOOLED` for CLI commands.
The runtime adapter still reads `DATABASE_URL`.
VERIFIED: Focused checks returned `tests 11; pass 11; fail 0`.
These checks inspect configuration and use stub commands. They do not contact a live database.
VERIFIED: Restoring only baseline config and package scripts returned `tests 6; pass 3; fail 3`.
Restoring the fix returned `tests 11; pass 11; fail 0`.
VERIFIED: Type checking, scoped ESLint, Prisma schema validation, and diff checks returned exit 0.
VERIFIED: `File length OK: 795 source files checked, none over 750 lines.`
REPORTED: Independent adversarial review found no issues in this diff.
Next: Open the PR against `dev`. Configure the direct URL separately in Vercel after merge.

## Action receipt and wallet-state warning context, 2026-10-04

Owner: coordinator. Status: Ready for PR.
Scope: Transaction receipt ownership, selected-action display and submit guards, deposit recovery, right review sidebar, and regression tests.
VERIFIED: The initial rail regression run returned `2 failed | 38 passed (40)`.
The Send receipt appeared in Add funds, and the right rail lacked the wallet-state warning.
VERIFIED: Accepted submissions now record their captured action. The selected action reads only its own receipt hash.
Raw submission state remains available to confirmation polling.
The warning moved from the left sidebar to the right review rail. Available receipt acknowledgement hides it.
VERIFIED: The final component suite returned `224 passed (224)` files and `2280 passed (2280)` tests.
VERIFIED: The focused atom and submit-state suite returned `tests 22; pass 22; fail 0`.
VERIFIED: Restoring only baseline rail and submit source returned `5 failed | 102 passed (107)`.
VERIFIED: Type checking and full ESLint returned exit 0. The file check returned `795 source files checked, none over 750 lines`.
REPORTED: The final independent adversarial review found no issues in this diff.
These tests use mocked workspace state. Live browser behavior was not checked.
Next: Open the PR against `dev` and wait for required checks.

## Receipt navigation and compact update notice, 2026-10-04

Owner: coordinator. Status: Ready for PR.
Scope: Preserve accepted receipts across action navigation, retire confirmed saved deposits, and position the compact update notice above the action button.
VERIFIED: The live Add funds page restored `da9a8262b646a79e21787287c7532a29f677eeddd4f63c02b2568e6119321eea`.
VERIFIED: `/api/mesh` returned an output of `2000000` lovelace to the displayed smart-wallet receive address.
Correction: The prior tests proved an action display leak. They did not establish that the live reported hash came from Send.
VERIFIED: The new regression baseline returned `4 failed | 75 passed (79)`.
VERIFIED: After the source changes, the full component suite returned `224 passed (224)` files and `2284 passed (2284)` tests.
VERIFIED: Type checking returned exit 0. The file check returned `795 source files checked, none over 750 lines`.
REPORTED: Independent adversarial review found no defects in this diff.
VERIFIED: ESLint on all changed source and test files and the final diff check returned exit 0.
The live page proved the old behavior. The updated code was checked through mocked component tests, not a deployed browser session.
Next: Open the follow-up PR against `dev` and wait for required checks.

## Activity display cap, 2026-10-04

Owner: coordinator. Status: Ready for PR.
Scope: Remove the 30-transaction display cut and retain the existing five-row activity pages.
VERIFIED: `recentWalletTransactionsAtom` selected 30 confirmed transactions. The display atom prepended pending rows outside that cut.
VERIFIED: Baseline regression tests returned `2 failed | 5 passed (7)`. The fixed regression run returned `7 passed (7)`.
VERIFIED: The full component suite returned `224 passed (224)` files and `2286 passed (2286)` tests.
VERIFIED: Transaction helper and wealth-series tests returned `tests 39; pass 39; fail 0`.
VERIFIED: Type checking, changed-file ESLint, and diff checks returned exit 0. The file check returned `795 source files checked, none over 750 lines`.
REPORTED: Independent adversarial review found no findings in the four-file source and test diff.
VERIFIED: History fetches remain bounded to eight pages. This change shows all fetched transactions; it does not establish complete lifetime history.
The updated behavior was checked through mocked activity state. Live browser behavior was not checked.
Next: Open the PR against `dev` and wait for required checks.

## History loading cancellation, 2026-10-04

Owner: coordinator. Status: Completed.
Scope: Address history reader, Mesh dispatch and route, and their regression tests.
VERIFIED: Before the source fix, `node --import tsx --test src/lib/mesh/address-history.test.ts` returned `tests 3; pass 1; fail 2`.
The failures reported `Expected concurrent history reads, saw 1` and `Missing expected rejection.`
VERIFIED: The focused Node check returned `tests 19; pass 19; fail 0`.
VERIFIED: The final I/O fixture check returned `tests 6; pass 6; fail 0`.
VERIFIED: Full Vitest returned `Test Files 224 passed (224); Tests 2281 passed (2281)`.
VERIFIED: Type checking, scoped ESLint, OpenAPI validation, and diff checks returned exit 0.
VERIFIED: The new reader has 90 lines. The existing tracked-file check returned `795 source files checked, none over 750 lines`.
VERIFIED: The simulated 100-transaction lookup returned `elapsedMs: 2837; transactions: 100; requests: 202; peakActive: 8`.
The earlier sequential simulation returned `elapsedMs: 20397; transactions: 100; requests: 202; peakActive: 1`.
Both simulations used responses delayed by 100 milliseconds. They do not measure live provider performance.
REPORTED: Independent adversarial review found no introduced defects and returned `tests 19; pass 19; fail 0`.
VERIFIED: Cancellation tests reject stalled reads and stop new requests after late responses.
The public provider API cannot cancel requests already sent. Those requests can still finish.
VERIFIED: Full Node returned `tests 2020; pass 1989; fail 0; skipped 31`.
The database-free run does not validate the skipped cases.
Next: Open a draft PR against `dev` and wait for required checks. No deployment has run.

## Frontend transaction build speed, 2026-10-05

Owner: coordinator. Status: In Progress.
Scope: Exact evaluation reuse, action-specific prebuild identity, and parallel consent and network checks.
VERIFIED: `git rev-parse --abbrev-ref HEAD` returned `perf/frontend-evaluation-reuse` after creating the three-layer stack.
VERIFIED: The earlier investigation used `fix/send-flow-review-ui` at `49913d24`. Its findings did not describe current upstream code.
VERIFIED: The new base is `origin/dev` at `a5d2a494`. It already has shared parameter snapshots, immutable input reads, and draft worker evaluation.
VERIFIED: The `origin/dev` baseline reuses only the last evaluation candidate in each pass. The final pass clears that entry.
VERIFIED: The cache retains up to 64 exact requests per pass. A new pass resets evaluation reuse.
VERIFIED: The source-only baseline check returned `tests 19; pass 16; fail 3`.
VERIFIED: With the cache source restored to baseline, the selector test returned `tests 1; pass 0; fail 1`, with `58 !== 40`.
VERIFIED: Focused tests returned `tests 30; pass 30; fail 0`. Worker and diagnostics checks returned `Tests 20 passed (20)`.
REPORTED: Independent review found no introduced defects. The selector fixture returned `upstreamRequestsByPass: [40,40]`. Its evaluation budgets are mocked.
VERIFIED: Type checking reports `TS2307` for missing `@vercel/functions` and `TS7006` in `regional-input-metadata.ts`. This layer does not modify that file.
Planned: Limit prebuild identity to the selected action. Preserve every active builder input and signing guard.
Planned: Read consent and wallet network concurrently. Keep freshness checks after those reads and before signing or broadcast.
Next: Commit evaluation reuse, then implement the action snapshot on its owning stack layer.

### Selected-action prebuild layer

Owner: coordinator. Status: In Progress.
REPORTED: Tests-first Node checks returned `tests 40; pass 23; fail 17`. The baseline invalidates prebuilds after unrelated form edits.
VERIFIED: `sfw pnpm install --frozen-lockfile --ignore-scripts` restored existing locked dependencies and returned exit 0. Package and lock files did not change.
VERIFIED: Type checking after that install returned exit 0. The earlier type errors came from the local dependency state.
Correction: The planned concurrent gates apply only at entry. Signing and broadcast keep consent before the network read.
INFERRED: Concurrent boundary reads can accept a network result taken before a slow consent check finishes. The wallet could switch during that wait.
VERIFIED: Expanded Node checks returned `tests 82; pass 82; fail 0`. Vitest returned `Test Files 4 passed (4); Tests 118 passed (118)`.
REPORTED: The final independent adversarial pass found no introduced defect. Active edits still retire prebuilds.
REPORTED: Scoped ESLint and type checking returned exit 0. Source files have 148, 83, and 648 lines.
Correction: Nine broader test failures used fields from an action different from the selected action. The fixtures now select the tested action.
Next: Commit this layer, then overlap entry checks while retaining ordered signing and broadcast gates.

### Functional regression review

Correction: The earlier clean review missed a mismatch between the scoped snapshot and shared STT preview signatures.
VERIFIED: The pending-build test returned `Tests 1 failed | 16 passed (17)` before the correction. The signature changed while the provider signal remained active.
VERIFIED: Restoring only the snapshot source to its prior version returned `tests 64; pass 58; fail 6`. The retained tests compare actual preview signatures with prepared-build validity.
VERIFIED: The corrected snapshot retains shared STT signature fields and the consolidation State draft. Other actions' form edits still preserve prepared builds.
VERIFIED: Focused checks returned `tests 64; pass 64; fail 0` and `Tests 17 passed (17)`.
REPORTED: The fresh independent review found no remaining defect. It returned `tests 96; pass 96; fail 0` and `Test Files 4 passed (4); Tests 119 passed (119)`.
Limit: The mismatch reproduction writes an atom directly. Ordinary allowance UI reachability remains unverified. The tests mock transaction builders and wallet signing.
VERIFIED: An independent cache probe returned `realEvaluator: Scalus`, `mem: 470102`, `steps: 147666434`, `realCalls: 3`, and `crossPassReevaluation: true`. This covers one offline mint fixture, not live ledger or browser Worker execution.
VERIFIED: Type checking and lint returned exit 0. File length check returned `796 source files checked, none over 750 lines`.
VERIFIED: The corrected prebuild layer's full suites returned `tests 2064; pass 2033; fail 0; skipped 31` and `Test Files 224 passed (224); Tests 2289 passed (2289)`. The 31 database cases were skipped.
