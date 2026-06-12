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
