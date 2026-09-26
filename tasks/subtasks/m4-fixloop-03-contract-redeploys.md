# Fix loop: rules for contract changes

Fix loop task · [Milestone 4](../milestone-4-testnet-feedback.md)

VERIFIED by source inspection on 2026-09-26 at `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
No tests or deployment drills were run for this task update.

Correction: a contract redeploy procedure already exists in the runbook.
Its written presence does not establish that a deployment followed every step.

## Completed

- [x] Document rebuild, blueprint sync, new wallet hashes, reference deployment, and verification. VERIFIED: `docs/RUNBOOK.md:209-220` contains these steps.
- [x] Document that existing wallets retain their old validators. VERIFIED: `docs/RUNBOOK.md:213-215` states this distinction.

## Remaining work and verification

- [ ] Complete the contract-change checklist with fuzz evidence, pinned compiler verification, and the new hashes in the PR.
- [ ] Record that the first relevant contract fix followed the checklist, or document why no such fix occurred during this milestone.
- [ ] For each changed STT hash, record the new reference-store deployment and cold-load detection. See [reference-store evidence](m4-deploy-04-reference-store.md).
- [ ] Confirm affected testers received the old-wallet/new-wallet distinction in the issue.
