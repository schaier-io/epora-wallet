# Milestone 5 submission review

Date: 2026-09-26. Owner: closeout coordinator. Status: Completed (content review).
Publication on `main` and Catalyst acceptance remain separate steps.

## Format checked against approved submissions

VERIFIED in the public Milestone Module in this session:

| Submission | Pattern observed | Admin signoff displayed |
| --- | --- | --- |
| [Milestone 1](https://milestones.projectcatalyst.io/projects/1100002/milestones/1) | A-C outputs, acceptance criteria, evidence links, and detailed whitepaper/task descriptions | `July 7, 2026 at 9:01 AM UTC` |
| [Milestone 2](https://milestones.projectcatalyst.io/projects/1100002/milestones/2) | A-E outputs, delivered descriptions, acceptance criteria, labeled source/test links | `August 6, 2026 at 11:56 AM UTC` |
| [Milestone 3](https://milestones.projectcatalyst.io/projects/1100002/milestones/3) | A-E outputs, explicit `Delivered`, acceptance criteria, labeled video/API/source links | `September 21, 2026 at 5:29 PM UTC` |

VERIFIED: the new [plain-text submission](milestone-5-submission.txt) uses this pattern.
The [report](closeout-report.pdf) uses the current required headings: Deliverables, Usage, Impact, Sustainability.
Source: [Catalyst report and video requirements](https://docs.projectcatalyst.io/current-fund/general-information/project-completion-report-and-video-requirements).
Earlier approvals establish the format precedent, not approval of Milestone 5.

## Requirement mapping

VERIFIED against the approved [final milestone](https://milestones.projectcatalyst.io/projects/1100002/milestones/5) and the authored submission:

| Required evidence | Submission output | Evidence |
| --- | --- | --- |
| Link to mainnet prototype | A | Live mainnet URL, healthy endpoint, current reference, confirmed transactions |
| Link to aggregated and categorized feedback | B | Feedback register with issue categories and linked fixes |
| Link to wallet-integration discussion | C | Public Discord message, screenshot, outreach record |
| Link to closeout report | D | PDF, source, measured mainnet evidence |
| Link to closeout video | E | Supplied YouTube URL, also in PDF and README |

VERIFIED: A includes the beta/unaudited scope. B describes further fixes and improvements.
C describes communication about potential collaboration without claiming an implemented integration.
The snapshot counts wallet contracts, not people. User-confirmed tests and deferred features remain distinct.

## Checks performed

- VERIFIED: `tectonic docs/closeout/closeout-report.tex` exited `0`; `pdfinfo` returned `Pages: 5`.
  All five pages were rendered with `pdftoppm` and inspected. No clipping or unresolved references were observed.
- VERIFIED: the report and submission contain 44 distinct URL strings. Thirty existing targets returned HTTP `200`.
  GitHub blob files were fetched through their raw-content URLs. YouTube used its public oEmbed endpoint.
  Its returned title was `Epora Wallet Catalyst-Closeout` and channel was `schaier-io`.
  An HTTP response or metadata result does not prove the full video content or its public/unlisted setting.
- VERIFIED: ten Cardanoscan links identify hashes or addresses verified through Koios. Automated explorer access was blocked.
  One Discord link needs sign-in; the public screenshot is the fallback. Three new evidence/submission paths were checked locally and require this PR to reach `main`.
- VERIFIED: all eight transaction fees, sizes, timestamps, block heights, and contract-result arrays match the saved Koios responses.
  Wallet amounts are 27,000,000 lovelace plus 3,788,490 lovelace in state deposits. The reference deposit is separate.
- REPORTED: the independent evidence reviewer returned `No concrete findings in the four reviewed files.`
  The coordinator also checked the source, rendered PDF, A-E mapping, amounts, and link destinations.

The writing detector returned scores 3/100 for the report source and 1/100 for each evidence/submission text.
Its remaining flags were formatting, repeated technical vocabulary, and the existing phrase `deferred features`.
These scores are a limited prose check, not proof of correctness.

## Publication and remaining checks

Use the A-E text after the PR merges. Its stable `main` URLs intentionally target the merged report and evidence.
Before submitting, open the new PDF and evidence links from `main` and confirm that they show this version.
The previous PDF already existed on `main`; a successful response for that URL alone does not prove the replacement is published.

VERIFIED record limits: backup restore, reindex, retention/isolation checks, deliberate alerting, full-action fee coverage,
multi-asset minimum ADA, and fragmented consolidation still lack completion evidence in these records.
The new chain results establish automatic proof-of-life refresh during an operator spend, not the dedicated manual renewal path.
These broader engineering tasks are not added to the approved milestone acceptance criteria.
No transaction, restore drill, production change, Catalyst submission, or merge was performed for this report update.
