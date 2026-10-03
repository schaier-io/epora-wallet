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
