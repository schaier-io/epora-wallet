# Development Tasks

Working task list for the [(Dead-man-switch) Permission-Based Wallet](https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet) (Catalyst Fund 11), split per milestone.

This is a rough breakdown, not a contract. We work scrum-style, so tasks get added, dropped, or re-scoped as things become clearer. Within each milestone the work is split into dev tasks and everything else (social, docs, feedback, reporting). Boxes are checked off as they land.

## Milestones

1. [Setup, Whitepaper and Planning](milestone-1-setup-whitepaper-planning.md) — produced the [whitepaper](../whitepaper/whitepaper.pdf)
2. [Smart Contract Development](milestone-2-smart-contract.md) — the validators under [code/smart-contract/](../code/smart-contract/README.md)
3. [Development of UI](milestone-3-ui-development.md) — the reference interface under [code/dApp/](../code/dApp/README.md)
4. [Testnet Launch & Feedback](milestone-4-testnet-feedback.md)
5. [Mainnet Beta & Closeout](milestone-5-mainnet-closeout.md)

Each file lists the work, then the Catalyst acceptance criteria and evidence it's measured against at the bottom. Open dev tasks are broken into inline subtasks; each subtask links to its own file in [subtasks/](subtasks/) with where the code stands today, the concrete steps, and what done means. Completed dev tasks link to retrospective subtasks: what landed, where it lives, which tests back it.

Checked boxes were last re-verified against the code on 2026-06-12: every claim traced to its implementing source and tests, `aiken check` green on the pinned compiler (21 test files — unit, attack-regression, fuzz), frontend unit suite 94/94.

## Public status update (2026-09-14)

The repository contains the [API guide](../docs/api/README.md),
[specification](../docs/api/openapi.json), and [wallet UI video](../docs/assets/wallet-ui.mp4?raw=1).
The earlier public checklist grouped these published files with unfinished validation.
The [public status](../README.md#current-public-status) lists the demo video once and groups the public API under the feedback launch.

At that snapshot, the [Milestone 3](milestone-3-ui-development.md) records still required an outside
guide review, a signed and confirmed API transaction, and a full feature walkthrough.
These artifacts do not establish deployment or mainnet readiness.
The June test results above are historical.

## Preprod feedback launch (2026-09-14)

The [Preprod feedback launch at epora.io](https://epora.io) is complete.
The public launch is complete. This corrects the earlier unchecked public status.
The detailed [Milestone 4](milestone-4-testnet-feedback.md) checks retain their own status.

## Closeout status correction (2026-09-26)

Mainnet and Preprod health endpoints returned HTTP 200 with `"database":"up","indexer":"up"`.
See the [Milestone 5 evidence](milestone-5-mainnet-closeout.md#evidence). Mainnet is live; the earlier open deployment status was stale.

The Vespr retest and outside API guide review are complete. An API-built transaction was signed and confirmed.
The wallet outreach task is complete with the [Discord evidence](../docs/wallet-integration.md).
The [closeout video](https://youtu.be/XKyZoa02kag) is supplied. The project completion date is 2026-09-26. Received Catalyst funds cover operating costs. The report records both and the longer-term sustainability plan.

WalletConnect signing/device testing and wallet-signed terms acceptance are deferred beyond closeout.
Checked tasks marked **Closed as deferred** record that decision, not completed implementation.
Unchecked operational checks retain their own evidence requirements. The test counts above are historical.
