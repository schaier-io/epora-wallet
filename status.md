# Mainnet beta preparation

Owner: release coordinator
Status: Mainnet beta verified; closeout evidence content review completed

## Closeout evidence update (2026-09-26)

Owner: closeout coordinator. Status: Completed (content review). Publication and Catalyst acceptance remain separate.

VERIFIED: GET `/api/health` returned HTTP 200 with `status: ok` at `2026-09-26T01:30:26.157Z`.
The [mainnet evidence](docs/closeout/mainnet-evidence.md) records eight confirmed transactions and two wallets holding 27 ADA, plus separate state deposits.
Correction: the deployment-pending status below belonged to the earlier preparation session. Mainnet availability and observed transactions are now established. Recovery drills and full economics coverage remain open.
VERIFIED: `tectonic docs/closeout/closeout-report.tex` exited `0`; `pdfinfo` returned `Pages: 5`. The [submission review](docs/closeout/submission-review.md) records the link checks and their limits. Next: publish the PR, merge it, then open the stable `main` evidence links before Catalyst submission.
The coordinator owns the report, evidence, submission text, and linked task corrections. The evidence reviewer has read-only ownership of the feedback and outreach cross-check.

## Scope

- REPORTED: The operator requested mainnet preparation with explicit beta consent,
  total-loss warnings, a no-audit disclosure, and legal pages for 41BIT LLC.
- VERIFIED: Local branches `feat/mainnet-network` and
  `feat/mainnet-beta-consent` were created with `gh stack` in this session.
- VERIFIED: No deployment, push, migration, or mainnet transaction was performed
  during initial inspection.

## Ownership

- Network implementer: network configuration, address and wallet network checks,
  transaction timing, provider selection, related tests and network copy.
- Consent implementer: consent policy, browser gate, API enforcement, banner,
  footer, layout, and related tests.
- Release coordinator: company and legal content, release evidence, integration,
  and final validation.

## Shared contracts

- The existing `CARDANO_NETWORK` and `cardanoNetworkId()` exports remain the
  shared network interface. `NEXT_PUBLIC_CARDANO_NETWORK` selects the build's
  network; the default remains Preprod.
- Legal identity, legal paths and acknowledgement version live in
  `src/lib/legal.ts` in the dApp.
- Consent is scoped to the network and legal version. It is an acknowledgement,
  not proof that a person read the notice or a signed wallet agreement.
- Legal documents remain readable before wallet providers start.

## Evidence and limits

- VERIFIED: Initial gate/footer component check returned `Tests 14 passed (14)`.
  This checks current behavior, not mainnet readiness or legal enforceability.
- REPORTED: Company details and `info@41bit.io` came from the operator.
- VERIFIED: Wyoming's registry returned a human-verification page. Independent
  confirmation of company status remains blocked by that challenge.
- VERIFIED: The local mainnet checklist contains unchecked validator freeze,
  deployment, and small-funds smoke steps. External completion is not determined.

## Local checks

- VERIFIED: Network, address, and slot checks on Node v24.14.0 returned
  `tests 15`, `pass 15`, `fail 0`.
- VERIFIED: `aiken check` returned `total: 750, passed: 750, failed: 0`,
  with seed `3106021271` (713 unit tests and 37 property tests). No contract
  source changed; this is not an audit.
- REPORTED: The independent network review found no remaining findings in its
  final pass after fixes to mainnet address conversion and navigation text.
- REPORTED: The network implementer reported 70 unit tests, 169 broader
  component tests, and 19 API tests passing. Counts across runs can overlap.

## Next action

VERIFIED: The network layer is committed as `2a2cd8ed`. The consent layer is
rebased onto it. Its post-rebase validation is recorded in the "Post-rebase
validation" section of `docs/mainnet-beta-release.md`.
Correction: this entry named `3c51eb7f` until the stack was rebased onto `dev`
at `5d936c45` on 2026-09-23. `2a2cd8ed` is the rebased network commit.
The earlier next-action entry described the state before integration.
Deployment and real-funds testing still require a separate release decision.

## Least confident decisions

1. Production processor contracts, hosting regions, and retention settings cannot
   be confirmed from source code. The release review must confirm them.
2. A browser/API acknowledgement does not provide durable wallet-signed proof.
   That separate feature is outside this preparation unless requested.
