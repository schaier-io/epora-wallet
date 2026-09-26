# (Dead-man-switch) Permission-Based Wallet — Epora

Welcome to the public repository for the identically named [Catalyst proposal](https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet) (Fund 11, Cardano Use Cases: Concept). It contains everything needed to recreate, set up, and self-host this version of the wallet: the on-chain validators, the reference web interface, and the LaTeX source of the [whitepaper](whitepaper/whitepaper.pdf).

The project is under active development and changes constantly, so the current version may not be stable — it mainly exists to showcase progress.

## What this is

A self-custodial Cardano wallet governed by an explicit, on-chain permission model rather than one all-powerful key. Smart-contract treasury tooling — multi-signature, spending policies — exists for large organizations; ordinary users have the same needs (inheritance, joint control, spending limits, recurring payments) and few options that fit them. This wallet brings that treasury-management approach to individual users. It is shipped under the name **Epora**.

The permission model covers:

- **Per-day allowances.** A spender can draw a user record's available allowance. The rolling daily cap applies per user record and asset. It requires the remaining grant at the interval's start to be no larger than the per-day grant. It also requires fixed user configuration and no operator refill or reconfiguration during that interval. Transaction validity windows cannot force an early reset. See the Allowance velocity theorem in the [whitepaper](whitepaper/whitepaper.pdf).
- **Weighted multi-signature.** Each owner carries signing power; operator actions pass once the summed power of the signers meets the configured threshold.
- **A proof-of-life dead-man-switch.** While the owner keeps renewing a deadline — by using the wallet, or through a dedicated liveness keeper — beneficiaries can do nothing. If the owner goes silent past the deadline, recovery unlocks.
- **Weighted-share beneficiary recovery.** An unlocked beneficiary may withdraw at most its weighted share of the distributable funds. Each nonfinal beneficiary acts once and then leaves the State. The sole final beneficiary remains for repeat recovery of current or future wallet UTxOs.
- **Streaming payments.** Recurring payouts accrue linearly to a fixed payee. Before terminal recovery, a named stakeholder can settle accrued value. After recovery opens, only an admin or the sole final beneficiary can settle it. A reserve protects accrued but unpaid value from other spends.
- **Stake-credential pinning.** Every continuing wallet output rests at the wallet's intended stake credential, so staking rewards, delegation, and governance votes on wallet funds stay under the wallet's control.

Architecturally, the entire configuration lives in a single `State` datum carried by a state-thread token (STT), and every movement of funds is bounded by a two-validator handshake: the STT validator proves the declared action equals the true state change, and the wallet validator bounds outgoing value by that same declared action. Features therefore compose as configuration on one small, reviewable contract instead of a bespoke contract per feature combination. Receiving needs no datum, so any wallet, exchange, or payroll system can pay in without knowing a smart contract is involved.

The [whitepaper](whitepaper/whitepaper.pdf) develops all of this in full: design goals, threat model, system architecture, the permission and recovery model, a formal model with proof sketches, an asset-based security analysis, and the design's limitations and trust assumptions.

## Beta risks and legal terms

**Epora is experimental beta software. No security audit has been completed. You
can permanently lose all funds or other assets used with it.** Internal testing
and code reviews do not constitute an independent security audit.

Use only funds you can afford to lose. Bugs, attacks, lost keys, incorrect
permissions, failed recovery rules, or unavailable services can cause loss or
permanently lock assets. No recovery outcome is guaranteed.

[Mainnet beta](https://mainnet.epora.io) uses real funds and has no independent security audit. [Preprod](https://epora.io) uses test funds.

The application requires explicit acknowledgement of beta status, no audit,
total-loss risk, and the current terms before it starts wallet connections.
Mainnet also requires a current acknowledgement on hosted API mutation requests.
The notice preserves rights that applicable law does not permit users to waive.

The default deployment network remains Preprod. A separate mainnet build requires
`NEXT_PUBLIC_CARDANO_NETWORK=mainnet` and a mainnet provider key. Network changes
require a rebuild. See [mainnet release preparation](docs/mainnet-beta-release.md)
for configuration, evidence, and the remaining deployment conditions.

The hosted service operator is **41BIT LLC**. Contact **info@41bit.io** for legal
and privacy requests. The application provides `/terms`, `/privacy`, and `/legal`
without requiring wallet connection or beta acceptance. The repository's [MIT
license](LICENSE) continues to govern the source code.

## Error reporting

The hosted deployment reports application errors to Sentry (EU region). A report carries the error message, stack trace, and request metadata. Wallet addresses, transaction hashes, cookies, and authorization headers are removed before upload, on both the browser and the server. Declining a signature in your wallet is never reported. Session replay and performance tracing are off. A self-hosted instance with no Sentry environment variables initializes no error reporting and sends nothing.

## Documentation

<!-- REPORTED 26 September 2026: Sandro supplied the Catalyst closeout video URL. -->
[Catalyst Fund11 closeout video](https://youtu.be/XKyZoa02kag) · [Closeout report (draft PDF)](docs/closeout/closeout-report.pdf)

### Wallet UI walkthrough ([MP4 source](docs/assets/wallet-ui.mp4?raw=1))

https://github.com/user-attachments/assets/0b5dd0e9-7e10-4ad4-982e-8d14b23ad96f

- [Contract state diagrams and action cycles](docs/smart-contract-state-diagram.md): permissions, state transitions, and separate examples traced from executable contract code.
- [Whitepaper (PDF)](whitepaper/whitepaper.pdf) — the canonical design document. Its LaTeX source lives in [whitepaper/](whitepaper/README.md), and CI rebuilds the committed PDF whenever the source changes.
- [Smart contract](code/smart-contract/README.md) — validator roles, the transition map, trust boundaries, test layout, and the local Aiken workflow.
- [dApp](code/dApp/README.md) — running the reference interface locally: setup, environment, and the flows it covers.
- [Development tasks](tasks/README.md) — the per-milestone task breakdown, with the Catalyst acceptance criteria each milestone is measured against.
- [Testnet feedback](docs/testnet-feedback.md) — categorized Preprod reports (`feasible`, `fixed`, `next`, `not-a-bug`) for Milestone 4.
- [Public API](docs/api/README.md): the developer guide covers reads, nine active transaction-build routes, errors, and rate limits. The [OpenAPI 3.1 document](docs/api/openapi.json) is served at `/api/v1/openapi.json`. The interactive reference is at `/api/v1/docs`.

The API builds unsigned transactions and returns them. It never holds a key and never signs.
The [mainnet API specification](https://mainnet.epora.io/api/v1/openapi.json) identifies its network as mainnet.
Preprod remains available for testing. The versioning policy is in the [API guide](docs/api/README.md).

## Structure

| Path | Contents |
|---|---|
| [`whitepaper/`](whitepaper/) | Whitepaper LaTeX source and the exported `whitepaper.pdf`. |
| [`code/smart-contract/`](code/smart-contract/) | The Aiken on-chain code: the STT and wallet validators, the always-fail reference store, shared libraries, and the test suite (unit, attack-regression, property-based fuzzing). |
| [`code/dApp/`](code/dApp/) | The Next.js reference interface: guided flows for creating and operating wallets, transaction preview, CIP-30/WalletConnect connect, and server-side chain proxies. |
| [`tasks/`](tasks/) | Milestone-by-milestone development task lists. |

Besides code, the repository tracks the editable source behind the project's deliverables (the whitepaper LaTeX) so later contributions can build on it. CI keeps generated artifacts in sync automatically: on every relevant push, the contract blueprint is rebuilt and mirrored into the frontend, and the whitepaper PDF is rebuilt from its source.

## Use of AI

AI is used to support development — chiefly to widen test coverage: generating unit and regression tests, drafting the attack scenarios behind each security invariant, and expanding property-based fuzzing inputs that probe boundary conditions a hand-written suite tends to miss. Every generated test is reviewed before it lands, and the security properties being checked are defined by us, not inferred by the model.

## Roadmap

This repository is under active development, and milestones are tracked within the proposal. Further details can be found under the 'Issues' and 'Projects' tabs.

Development tasks — completed and open, grouped per milestone — are tracked in the [tasks/](./tasks) folder.

Current focus: **Mainnet beta and Catalyst closeout**. The [mainnet beta](https://mainnet.epora.io) and [Preprod app](https://epora.io) are live.
VERIFIED 2026-09-26: both health endpoints returned HTTP 200 with `"database":"up","indexer":"up"`.
This corrects the earlier statement that mainnet beta remained open. See the [Milestone 5 evidence](tasks/milestone-5-mainnet-closeout.md#evidence) for the check and its limits.

### Current public status

- [x] Whitepaper
- [x] Core smart-contract validators and tests
- [x] Reference frontend for Preprod flows
- [x] Detailed development tasks
- [x] [Demo video](docs/assets/wallet-ui.mp4?raw=1)
- [x] [Testnet feedback launch](https://epora.io) (Preprod, including the public API)
- [ ] [Full manual feature walkthrough](tasks/subtasks/m3-walk-02-run.md), with transaction evidence.
- [x] [Mainnet beta](https://mainnet.epora.io), with an unaudited-beta warning.
- [x] [Catalyst closeout video](https://youtu.be/XKyZoa02kag), supplied by Sandro on 2026-09-26.
- [ ] Finalize the [closeout report](docs/closeout/closeout-report.pdf), including the completion date.

## Contributing

*The project is experimental beta software. Code and behavior may change before a full release.*

We encourage discussions and ideas, but prioritize the modules stated in the Catalyst proposal first.

Since this is a very early stage, active contributions are not intended at this point. We will however open it up later on. If you encounter significant issues, bugs, or potential security vulnerabilities, please open an issue or discuss them with the community or me directly on the social media channels, especially Discord.

## Social Media

### Discord

This is the ideal platform to get in touch and interact with the community. [Join us on Discord](https://discord.gg/2uh4BynQBW).

### X

Follow [@schaier_io](https://x.com/schaier_io) on X for project updates.
