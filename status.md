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

- In Progress, coordinator: five PR layers cover wallet recovery, signature writes, proposal input liveness, deposits, and governance drafts. VERIFIED: the local stack starts at `fix/wallet-focus-connect-race` and ends at `fix/governance-draft-wallet-switch`.
- VERIFIED: wallet regressions returned `Tests 2 failed | 38 skipped (40)` before the source change. The wallet and toast suites then returned `Tests 48 passed (48)`.
- REPORTED: an independent adversarial review of the wallet change found no in-scope issues. VERIFIED: recovery reads the live connection atom before starting another connection.
- Next, coordinator: validate the remaining patches, review each layer, and open five draft PRs. Local fixtures do not establish live ledger or database behavior.
