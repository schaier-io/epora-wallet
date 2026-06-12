# (Dead-man-switch) Permission-Based Wallet — Epora

Welcome to the public repository for the identically named [Catalyst proposal](https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet) (Fund 11, Cardano Use Cases: Concept). It contains everything needed to recreate, set up, and self-host this version of the wallet: the on-chain validators, the reference web interface, and the LaTeX source of the [whitepaper](whitepaper/whitepaper.pdf).

The project is under active development and changes constantly, so the current version may not be stable — it mainly exists to showcase progress.

## What this is

A self-custodial Cardano wallet governed by an explicit, on-chain permission model rather than one all-powerful key. Smart-contract treasury tooling — multi-signature, spending policies — exists for large organizations; ordinary users have the same needs (inheritance, joint control, spending limits, recurring payments) and few options that fit them. This wallet brings that treasury-management approach to individual users. It is shipped under the name **Epora**.

The permission model covers:

- **Per-day allowances.** A spender key can draw up to a daily cap, with a rolling reset that cannot be forged by stretching a transaction's validity window. A stolen or coerced everyday key yields at most one day's allowance per day, never the bulk.
- **Weighted multi-signature.** Each owner carries signing power; operator actions pass once the summed power of the signers meets the configured threshold.
- **A proof-of-life dead-man-switch.** While the owner keeps renewing a deadline — by using the wallet, or through a dedicated liveness keeper — beneficiaries can do nothing. If the owner goes silent past the deadline, recovery unlocks.
- **Weighted-share beneficiary recovery.** An unlocked beneficiary may withdraw at most its weighted share of the distributable funds, once, optionally only after a personal delay (say, reaching adulthood). Shares re-normalize as beneficiaries act, so the set collectively recovers everything in any order — without anyone ever sharing a seed phrase.
- **Streaming payments.** Recurring payouts (a salary, an allowance, a retainer) accrue linearly to a fixed payee and can be settled by anyone; settlement is permission-less and rate-limited, so income keeps flowing even if the owner is offline or gone. Accrued-but-unpaid value sits behind a reserve that no other spend, not even an owner's, may draw below.
- **Stake-credential pinning.** Every continuing wallet output rests at the wallet's intended stake credential, so staking rewards, delegation, and governance votes on wallet funds stay under the wallet's control.

Architecturally, the entire configuration lives in a single `State` datum carried by a state-thread token (STT), and every movement of funds is bounded by a two-validator handshake: the STT validator proves the declared action equals the true state change, and the wallet validator bounds outgoing value by that same declared action. Features therefore compose as configuration on one small, reviewable contract instead of a bespoke contract per feature combination. Receiving needs no datum, so any wallet, exchange, or payroll system can pay in without knowing a smart contract is involved.

The [whitepaper](whitepaper/whitepaper.pdf) develops all of this in full: design goals, threat model, system architecture, the permission and recovery model, a formal model with proof sketches, an asset-based security analysis, and the design's limitations and trust assumptions.

## Disclaimer — Use at Your Own Risk

**This software is provided "as is", without warranty of any kind.** The code has **not been audited**. It is experimental, in active development, and may contain bugs, security vulnerabilities, or breaking changes at any time.

- **No guarantees.** There is no guarantee of correctness, security, availability, or fitness for any purpose.
- **You are solely responsible.** Any use of this software — including interacting with the smart contracts or running the frontend — is entirely at your own risk.
- **Lost or stolen funds are on the user.** The authors and contributors accept **no liability** for any loss of funds, assets, or data, on testnet or mainnet, arising from the use, misuse, or malfunction of this software.
- The wallet currently targets the **Cardano Preprod test network**. Do not use it with real funds.

By using this software you acknowledge and accept these risks. See the [LICENSE](./LICENSE) for the full legal terms.

## Documentation

- [Whitepaper (PDF)](whitepaper/whitepaper.pdf) — the canonical design document. Its LaTeX source lives in [whitepaper/](whitepaper/README.md), and CI rebuilds the committed PDF whenever the source changes.
- [Smart contract](code/smart-contract/README.md) — validator roles, the transition map, trust boundaries, test layout, and the local Aiken workflow.
- [dApp](code/dApp/README.md) — running the reference interface locally: setup, environment, and the flows it covers.
- [Development tasks](tasks/README.md) — the per-milestone task breakdown, with the Catalyst acceptance criteria each milestone is measured against.

A public, versioned API/spec for outside developers is planned but not yet published (see the roadmap below).

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

Current focus: **UI and off-chain developer surface**. The smart-contract work is substantially implemented; testnet launch, mainnet beta, external API documentation, and demo/feedback work are still pending. See the task files for the current milestone breakdown.

### Current public status

- [x] Whitepaper
- [x] Core smart-contract validators and tests
- [x] Reference frontend for Preprod flows
- [x] Detailed development tasks
- [ ] Public, versioned API/spec for outside developers
- [ ] Demo video and full manual feature walkthrough
- [ ] Testnet feedback launch
- [ ] Mainnet beta

## Contributing

*The project is not yet near a beta phase or release; it currently serves mainly to illustrate progress. Code and features may change without notice before a full release.*

We encourage discussions and ideas, but prioritize the modules stated in the Catalyst proposal first.

Since this is a very early stage, active contributions are not intended at this point. We will however open it up later on. If you encounter significant issues, bugs, or potential security vulnerabilities, please open an issue or discuss them with the community or me directly on the social media channels, especially Discord.

## Social Media

### Discord

This is the ideal platform to get in touch and interact with the community. [Join us on Discord](https://discord.gg/2uh4BynQBW).

### X

Follow [@eporawallet](https://x.com/eporawallet) on X for project updates.
