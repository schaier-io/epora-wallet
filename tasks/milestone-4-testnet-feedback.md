# Milestone 4 — Testnet Launch & Feedback

Get it onto a public testnet, put it in front of people, fix what they hit.

## Development tasks

- [ ] **Deploy to testnet** — the app already targets preprod; this is hosting it publicly and writing down what got deployed.
  - [ ] [Host, database, secrets (+ dev-fallback refusal)](subtasks/m4-deploy-01-hosting.md)
  - [ ] [`prisma migrate deploy` in the release step + drift check](subtasks/m4-deploy-02-migrations.md)
  - [ ] [Schedule the indexer — cron on `/api/stt/sync`](subtasks/m4-deploy-03-sync-cron.md)
  - [ ] [Deploy the shared STT reference store, record it](subtasks/m4-deploy-04-reference-store.md)
  - [ ] [Smoke pass + evidence (URL, validator hashes, tx hashes)](subtasks/m4-deploy-05-smoke-evidence.md)
- [ ] **Onboarding & observability** — testers get themselves funded; we see what breaks without being told.
  - [ ] [Faucet pointer + pre-flight hints](subtasks/m4-onboard-01-faucet-preflight.md)
  - [ ] [Visible feedback links (Discord, issues)](subtasks/m4-onboard-02-feedback-links.md)
  - [ ] [Error sink for crashes, failed submits, API 500s](subtasks/m4-onboard-03-error-sink.md)
- [ ] **Fix loop** — reports become labeled issues, fixes become verified closes.
  - [ ] [Intake — issue templates, labels, Discord-to-issue](subtasks/m4-fixloop-01-intake.md)
  - [ ] [Triage, fix, verify, publish](subtasks/m4-fixloop-02-triage-verify.md)
  - [ ] [Rules for contract-touching fixes (hash changes, re-test, store redeploy)](subtasks/m4-fixloop-03-contract-redeploys.md)

## Non-development tasks

- [ ] Announce launch (Discord, Twitter/X).
- [ ] Tester guide — connect, fund, try each feature.
- [ ] Collect + sort feedback (feasible/fixed/next/not-a-bug); publish.

## Acceptance criteria (Catalyst)

- A usable prototype on testnet
- Feedback, aggregated
- Improvements / fixes that came out of it

## Evidence

- Link to the prototype
- Link to the categorized feedback
- Link to the fixes per category (issues, PRs, closed tickets)
