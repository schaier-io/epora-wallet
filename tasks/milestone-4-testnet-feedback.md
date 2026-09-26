# Milestone 4: Testnet Launch and Feedback

Get it onto a public testnet, put it in front of people, fix what they hit.

## Public launch

- [x] [Testnet feedback launch at epora.io](https://epora.io) (Preprod).

REPORTED: Sandro confirmed the Preprod launch on 2026-09-14.
This corrects the earlier unchecked public-launch status. The operational
checks and feedback tasks below still need their own completion evidence.

## Status correction (2026-09-26)

VERIFIED: source inspection used `origin/main` at `d3b5a2391e6f58836752ec40e39eec4139f8d886`.
The old checklist mixed completed implementation with outstanding live checks.
The subtasks now separate those states. No tests or deployment drills were run for this update.

## Development tasks

- [x] **Public testnet deployment**. The launch and working health endpoint are recorded above and in the evidence below. The remaining deployment checks are separate tasks.
  - [ ] [Host configuration and remaining environment verification](subtasks/m4-deploy-01-hosting.md)
  - [ ] [`prisma migrate deploy` in the release step + drift check](subtasks/m4-deploy-02-migrations.md)
  - [x] Configure the indexer cron. VERIFIED: `code/dApp/vercel.json:10-15` defines the five-minute schedule.
  - [ ] [Record 24 hours of unattended indexer runs](subtasks/m4-deploy-03-sync-cron.md).
  - [ ] [Deploy the shared STT reference store, record it](subtasks/m4-deploy-04-reference-store.md)
  - [ ] [Smoke pass + evidence (URL, validator hashes, tx hashes)](subtasks/m4-deploy-05-smoke-evidence.md)
- [ ] **Onboarding & observability**. Implementation and live checks are separate below.
  - [x] Add faucet links, wallet installation links, and network checks. VERIFIED: [source locations](subtasks/m4-onboard-01-faucet-preflight.md#completed).
  - [ ] [Finish placement checks and observe a fresh tester](subtasks/m4-onboard-01-faucet-preflight.md#remaining-work-and-verification).
  - [x] [Visible feedback links (Discord, issues)](subtasks/m4-onboard-02-feedback-links.md)
  - [x] Implement Sentry capture, scrubbing, and release attribution. VERIFIED: [source locations](subtasks/m4-onboard-03-error-sink.md#completed).
  - [ ] [Verify caught render errors and live event delivery](subtasks/m4-onboard-03-error-sink.md#remaining-work-and-verification).
- [ ] **Fix loop**. The published batch is recorded. Ongoing verification remains open.
  - [x] [Intake: issue forms, categories, and Discord reports](subtasks/m4-fixloop-01-intake.md). VERIFIED: forms and category definitions exist. REPORTED: the feedback page now includes Discord issue #565.
  - [x] Publish the categorized batch and its fix links. VERIFIED: [49 document entries, 46 categorized as fixed](subtasks/m4-fixloop-02-triage-verify.md#completed).
  - [ ] [Continue triage and verify each closure](subtasks/m4-fixloop-02-triage-verify.md#remaining-work-and-verification).
  - [x] Document the contract redeploy procedure. VERIFIED: `docs/RUNBOOK.md:209-220`.
  - [ ] [Complete and verify the contract-change checklist](subtasks/m4-fixloop-03-contract-redeploys.md#remaining-work-and-verification).

## Non-development tasks

- [ ] Announce launch (Discord, Twitter/X).
- [ ] Tester guide: connect, fund, and try each feature.
- [x] Collect + sort feedback (feasible/fixed/next/not-a-bug); publish.

## Acceptance criteria (Catalyst)

- A usable prototype on testnet
- Feedback, aggregated
- Improvements / fixes that came out of it

## Evidence

- [Preprod prototype](https://epora.io)
- [Categorized feedback](../docs/testnet-feedback.md)
- Fixes per category: GitHub issues labeled [`fixed`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Afixed), [`feasible`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Afeasible), [`next`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Anext), [`not-a-bug`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Anot-a-bug)

### Recorded hashes (2026-09-20)

VERIFIED from `code/smart-contract/plutus.json` on this branch:

| Validator | Hash |
| --- | --- |
| STT mint/spend | `0dac00be80879dcf585cdb9d0acf6e0ecf52c417ded30d8b72d0ebf1` |
| STT reference store | `fc20070d1e5379403add6acbf77b233b2f8240821c187b398525de28` |
| Wallet (unparameterized) | `5f8f25f5b598548b224efba3082ffbdd33f46ec58274282b63d0d701` |

REPORTED production spend on Preprod (epora.io, 4 Sep 2026, 2-of-2 send): [`64c01da1705083a6565b0f6a56cc5674396757e45426e3f80dbca3def0a6f731`](https://preprod.cardanoscan.io/transaction/64c01da1705083a6565b0f6a56cc5674396757e45426e3f80dbca3def0a6f731)

Correction: the earlier `503` sample and merge blocker are historical, not the current deployment status.
REPORTED: `docs/testnet-feedback.md:150` records HTTP `200`, database/indexer `up`, and `recentHeadFresh: true` on 2026-09-22.
REPORTED: the parent reviewer measured Preprod health at 2026-09-26 00:39:26 UTC: HTTP `200`, `status: ok`, `database: up`, `indexer: up`, `recentHeadFresh: true`, `walletReconcileFresh: true`, `historyBackfillCompleted: true`.
These samples do not establish 24 hours of unattended cron operation.
