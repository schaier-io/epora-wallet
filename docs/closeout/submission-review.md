# Milestone 5 submission checklist

Date: 26 September 2026. Project 1100002.

## Format and prior approvals

The [plain-text submission](milestone-5-submission.txt) follows the lettered output, acceptance criteria, and evidence format used in earlier approved submissions.

| Submission | Format | Admin signoff |
| --- | --- | --- |
| [Milestone 1](https://milestones.projectcatalyst.io/projects/1100002/milestones/1) | A-C outputs, acceptance criteria, evidence links, and whitepaper/task descriptions | 7 July 2026, 09:01 UTC |
| [Milestone 2](https://milestones.projectcatalyst.io/projects/1100002/milestones/2) | A-E outputs, delivered descriptions, acceptance criteria, source/test links | 6 August 2026, 11:56 UTC |
| [Milestone 3](https://milestones.projectcatalyst.io/projects/1100002/milestones/3) | A-E outputs, delivered descriptions, acceptance criteria, video/API/source links | 21 September 2026, 17:29 UTC |

The [report](closeout-report.pdf) uses Deliverables, Usage, Impact, and Sustainability, as requested by the current [Catalyst report guidance](https://docs.projectcatalyst.io/current-fund/general-information/project-completion-report-and-video-requirements).
Earlier approvals establish a format precedent; they do not approve Milestone 5.

## Requirement mapping

The approved [final milestone](https://milestones.projectcatalyst.io/projects/1100002/milestones/5) requires these five evidence links.

| Required evidence | Submission output | Evidence |
| --- | --- | --- |
| Mainnet prototype | A | [Live beta](https://mainnet.epora.io), [health endpoint](https://mainnet.epora.io/api/health), and [confirmed transactions](mainnet-evidence.md) |
| Aggregated and categorized feedback | B | [Feedback register](../testnet-feedback.md) with categories and linked fixes |
| Wallet-integration discussion | C | [Outreach record](../wallet-integration.md), public Discord message, and screenshot |
| Closeout report | D | [PDF](closeout-report.pdf), source, and measured mainnet evidence |
| Closeout video | E | [YouTube video](https://youtu.be/XKyZoa02kag), also linked in the PDF and README |

Output A states the unaudited beta scope. Output B describes fixes and improvements.
Output C records communication about potential collaboration. Native wallet integration remains future work.
The report describes the whole product, intended users, measured activity, lessons, maintenance, and funding.
No revenue is currently generated. Server and other operating costs are covered by received Catalyst funds. Any external audit depends on community feedback on the proposed CIP and its implementation. If needed, the audit is intended to be financed through a separate funding round.

## Evidence scope

The [mainnet snapshot](mainnet-evidence.json) contains eight confirmed transactions and two wallets under the current policy.
Wallet payment outputs total 27 ADA; separate state deposits total 3.788490 ADA.
The reference-script deposit is separate. These figures measure prototype activity, not independent adoption.

Koios supplies the chain data. Cardanoscan links identify the same hashes and addresses for public inspection.
The Discord link requires sign-in; the public screenshot provides an accessible copy of the outreach message.
The video is titled “Epora Wallet Catalyst-Closeout” on the `schaier-io` channel.

## Publication and remaining work

The submission uses stable `main` URLs. Merge the documentation update before submitting those links to Catalyst.
Open the report and evidence on `main` after the merge to confirm that they show the updated content.

Backup restore, reindex, retention/isolation checks, deliberate alerting, wider fee coverage,
multi-asset minimum ADA, and fragmented consolidation still lack completion evidence in the linked records.
The observed operator spend refreshed proof of life automatically; it does not establish the separate manual renewal path.
These engineering checks are separate from the approved milestone acceptance criteria.
WalletConnect signing/device tests and wallet-signed terms acceptance remain deferred.
