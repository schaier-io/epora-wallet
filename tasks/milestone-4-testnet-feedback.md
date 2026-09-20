# Milestone 4 — Testnet Launch & Feedback

Get it onto a public testnet, put it in front of people, fix what they hit.

## Public launch

- [x] [Testnet feedback launch at epora.io](https://epora.io) (Preprod).

REPORTED: Sandro confirmed the Preprod launch on 2026-09-14.
This corrects the earlier unchecked public-launch status. The operational
checks and feedback tasks below still need their own completion evidence.

## Development tasks

- [ ] **Deploy to testnet** — the app already targets preprod; this is hosting it publicly and writing down what got deployed.
  - [ ] [Host, database, secrets (+ dev-fallback refusal)](subtasks/m4-deploy-01-hosting.md)
  - [ ] [`prisma migrate deploy` in the release step + drift check](subtasks/m4-deploy-02-migrations.md)
  - [x] [Schedule the indexer — cron on `/api/stt/sync`](subtasks/m4-deploy-03-sync-cron.md) — Vercel cron in `vercel.json`. First production run still needs `CRON_SECRET` in Vercel (same value as `STT_SYNC_SECRET`).
  - [ ] [Deploy the shared STT reference store, record it](subtasks/m4-deploy-04-reference-store.md)
  - [ ] [Smoke pass + evidence (URL, validator hashes, tx hashes)](subtasks/m4-deploy-05-smoke-evidence.md)
- [ ] **Onboarding & observability** — testers get themselves funded; we see what breaks without being told.
  - [ ] [Faucet pointer + pre-flight hints](subtasks/m4-onboard-01-faucet-preflight.md)
  - [x] [Visible feedback links (Discord, issues)](subtasks/m4-onboard-02-feedback-links.md)
  - [ ] [Error sink for crashes, failed submits, API 500s](subtasks/m4-onboard-03-error-sink.md)
- [ ] **Fix loop** — reports become labeled issues, fixes become verified closes.
  - [x] [Intake — issue templates, labels, Discord-to-issue](subtasks/m4-fixloop-01-intake.md) — templates and labels exist. Discord copy is the standing rule; none were on file for this snapshot.
  - [ ] [Triage, fix, verify, publish](subtasks/m4-fixloop-02-triage-verify.md)
  - [ ] [Rules for contract-touching fixes (hash changes, re-test, store redeploy)](subtasks/m4-fixloop-03-contract-redeploys.md)

## Non-development tasks

- [ ] Announce launch (Discord, Twitter/X).
- [ ] Tester guide — connect, fund, try each feature.
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

Health at evidence time: `GET https://www.epora.io/api/health` returned 503 (indexer never stamped a sync). The Vercel cron is the fix. It starts after merge to `main` plus `CRON_SECRET` in Vercel Production.
