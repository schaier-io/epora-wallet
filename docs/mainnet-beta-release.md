# Mainnet beta release preparation

This record distinguishes source preparation from permission to deploy.
It does not certify contract safety or legal compliance.

## Operator and legal documents

REPORTED by the operator in this task:

- Operator: 41BIT LLC, a Wyoming LLC.
- Entity ID: `2026-001999964`.
- Mailing address: 5830 E 2nd St, Ste 7000 #36418, Casper, Wyoming 82609,
  United States.
- Legal and privacy contact: `info@41bit.io`.

VERIFIED: The [Wyoming registry](https://wyobiz.wyo.gov/Business/FilingSearch.aspx)
returned a human-verification page during this task. Independent verification of
registration and current standing was not completed. The site does not claim
that the supplied details were independently verified.

The proposed public documents are `/terms`, `/privacy`, and `/legal`.
Their version is `epora-beta-1`. Company values live in
`code/dApp/src/lib/legal.ts`. Public document copy lives in
`code/dApp/messages/en/catalog-legal.json`.

The terms disclose beta status, no completed security audit, and possible
permanent loss of all funds. They preserve rights that cannot legally be waived.
The privacy notice is separate from acknowledgement of the beta risks.

Legal sources consulted:

- [GDPR Articles 13 and 14](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng):
  identity, purposes, legal bases, recipients, retention, transfers, rights,
  and sources of indirectly collected data, where applicable.
- [Unfair Terms Directive, Article 6](https://eur-lex.europa.eu/eli/dir/1993/13/oj/eng):
  an agreement cannot make an unfair consumer term binding where this law applies.

These sources do not determine every law applicable to the company or service.

## Privacy evidence and unresolved operations

VERIFIED from source:

| Processing | Evidence | Limit |
| --- | --- | --- |
| Public wallet records and participants | `code/dApp/src/lib/stt-cache/indexer.ts`, `fetchCollectionAssets` and `replaceWalletParticipants` | Records can concern people who never visited the site. |
| Proposal sharing | `code/dApp/src/app/api/proposals/[id]/route.ts`, `requireProposalParticipant` then `getProposalRecord` | Participants can see data before blockchain submission. |
| Sign-in registration | `code/dApp/prisma/schema.prisma`, `SignerRegistration` | No expiry field establishes a deletion deadline. |
| Seven-day sign-in validity | `code/dApp/src/lib/proposals/auth.ts`, `SESSION_TTL_MS` | Cookie validity does not establish database or backup retention. |
| Error reporting | `code/dApp/src/instrumentation-client.ts` and `lib/observability/sentry-options.ts` | Sentry is conditional on configured DSNs; production settings were not inspected. |
| Rate-limit cleanup | `code/dApp/src/lib/http/rate-limit-store.ts`, `Math.random() < 0.01` | Cleanup is opportunistic, not a guaranteed deletion deadline. |

Before legal publication, the operator must confirm the deployed processors,
their regions, transfer arrangements, and log/backup retention. The operator must
also confirm the legal basis and retention policy for public participant data
and off-chain proposals. The policy describes the current absence of uniform
automatic deletion instead of inventing retention periods.

## Deployment checks

1. Build a separate mainnet deployment with `NEXT_PUBLIC_CARDANO_NETWORK=mainnet`
   and `BLOCKFROST_MAINNET_PROJECT_ID`. Rebuild when changing networks.
   Keep Preprod as its own deployment.
2. Provision a separate mainnet database and unique authentication/sync secrets.
   Review migrations before running them. Confirm cron authentication and indexing.
3. Review and freeze the validator blueprint for the intended release commit.
   Record hashes, compiler version, test evidence, and unresolved contract issues.
4. Confirm the legal documents against actual operations. Test initial consent,
   rejected consent, direct API calls, and legal-page access on the deployed host.
5. Only after approval, deploy the reference store and perform a small-funds
   mainnet smoke test. Record transaction hashes and measured fees before launch.

INFERRED: Completing application tests does not establish that production secrets,
provider accounts, contract deployments, or backup recovery work. These checks
need their own evidence. No mainnet transaction or deployment was authorized by
the company-details message.

## Validation in this task

VERIFIED on Node v24.14.0:

- Mainnet production build: `next build --webpack`, exit `0`. TypeScript and
  generation of all `41/41` static pages completed. Dependency warnings concerned
  dynamic instrumentation imports and next-intl cache invalidation.
- Unit suite: `tests 1817`, `pass 1792`, `fail 0`, `skipped 25`.
  `DATABASE_URL` was unset. This did not test database integration.
- Component suite: `Test Files 184 passed (184)`, `Tests 1707 passed (1707)`.
  After the final landmark, spacing, and legal-banner changes, the affected
  component suites returned `29 passed (29)` and the full unit suite above passed.
- Contract checks: `total: 750, passed: 750, failed: 0`, seed `3106021271`.
  Aiken v1.1.23 ran 713 unit tests and 37 property tests. These are not an audit.
- Type checking, ESLint, translation checks, source length checks, blueprint
  mirror checks, and OpenAPI generation checks exited `0`.

VERIFIED negative control: Restoring the previous shared submission source while
keeping the new tests returned `4 failed | 12 skipped (16)`, exit `1`.
The current source was restored, and all 16 submission tests then passed.

VERIFIED local production checks at `http://127.0.0.1:3017`:

- `/api/beta-consent` returned `200` with
  `{"accepted":false,"network":"mainnet","version":"epora-beta-1"}`.
- A POST to the retired transaction route without acceptance returned
  `403` with `"code":"BETA_CONSENT_REQUIRED"`. The same request with prefetch
  headers or the stale acknowledgement `mainnet:old` also returned `403`.
- The browser displayed four unchecked boxes and a disabled
  `Accept risks and continue` button. Terms and privacy pages were readable before
  acceptance and displayed the mainnet warning, company details, and contact.

Limits: The live browser check did not accept terms on the operator's behalf,
connect a wallet, or sign a transaction. Automated tests cover acceptance and
submission guards. A deployed-host check remains required.

VERIFIED environment limitation: The first default build could not fetch Google
Fonts. The network-enabled Turbopack build then failed with
`binding to a port: Operation not permitted (os error 1)`.
The Webpack build above succeeded; the default Turbopack production build remains
unverified in this environment.

REPORTED: The final independent adversarial review found no actionable findings
in the changed network, consent, signing, and legal-page paths. This is a code
review, not an independent security audit. An existing OpenAPI `Apache-2.0`
license declaration differs from the root `MIT` license and was left outside
this change.

## Least confident decisions

1. Jurisdiction-specific terms and privacy obligations need review against actual
   business operations and intended users. This preparation cannot establish them.
2. Browser cookies and API headers record an acknowledgement in a request. They
   do not establish durable, wallet-signed evidence of acceptance.
3. Registry verification, production configuration, and a real-funds smoke test
   remain separate release conditions.
